import { describe, expect, it } from "vitest";
import { err, ok } from "~/lib/result";
import type { SafeAdminUser } from "~/ports/admin-users";
import type { AuthAttemptLimiter } from "~/ports/auth-rate-limit";
import { handleMfaAction, type MfaActionDeps } from "./mfa.server";

const USER: SafeAdminUser = {
  id: "staff-1", email: "sam@team.dev", name: "Sam", role: "admin", status: "active", createdAt: 0, updatedAt: 0, lastLoginAt: null,
};
const allowed: AuthAttemptLimiter = { check: async () => "allowed" };

function post(code?: string) {
  const form = new FormData();
  if (code !== undefined) form.set("code", code);
  return new Request("https://example.test/internal/login/mfa", { method: "POST", body: form, headers: { "CF-Connecting-IP": "203.0.113.5" } });
}

function harness(overrides: Partial<MfaActionDeps> = {}) {
  const events: string[] = [];
  const deps: MfaActionDeps = {
    limiter: allowed,
    productionLike: true,
    readChallenge: async () => ({ adminUserId: USER.id, next: "/internal/shops" }),
    findUser: async () => USER,
    verify: async () => ok("totp" as const),
    recordFailure: async () => { events.push("failure"); },
    recordRecoveryCodeUse: async () => { events.push("recovery"); },
    completeSignIn: async (user, next) => {
      events.push(`signed-in:${user.id}:${next}`);
      return new Response(null, { status: 302, headers: { Location: next } });
    },
    ...overrides,
  };
  return { deps, events };
}

/** The action's outcome: a Response it returned or threw, or a `data()` result's status and error. */
async function outcome(run: Promise<unknown>): Promise<{ status: number; location?: string | null; error?: unknown }> {
  const result = await run.catch((thrown: unknown) => thrown);
  if (result instanceof Response) return { status: result.status, location: result.headers.get("Location") };
  if (result && typeof result === "object" && "init" in result && "data" in result) {
    const init = result.init;
    const body = result.data;
    const status = init && typeof init === "object" && "status" in init ? Number(init.status) : 200;
    const error = body && typeof body === "object" && "error" in body ? body.error : undefined;
    return { status, error };
  }
  throw new Error(`unexpected action result: ${JSON.stringify(result)}`);
}

describe("the second sign-in step", () => {
  it("signs in with a valid code and goes where the password step was headed", async () => {
    const { deps, events } = harness();
    expect(await outcome(handleMfaAction(post("123456"), deps))).toEqual({ status: 302, location: "/internal/shops" });
    expect(events).toEqual(["signed-in:staff-1:/internal/shops"]);
  });

  it("sends anyone without a fresh password step back to the password form, signing nobody in", async () => {
    const { deps, events } = harness({ readChallenge: async () => undefined });
    expect(await outcome(handleMfaAction(post("123456"), deps))).toEqual({ status: 302, location: "/internal/login" });
    expect(events).toEqual([]);
  });

  it("refuses a wrong code with 401 and records the failure", async () => {
    const { deps, events } = harness({ verify: async () => err("invalidCode") });
    expect(await outcome(handleMfaAction(post("000000"), deps))).toEqual({ status: 401, error: "invalidCode" });
    expect(events).toEqual(["failure"]);
  });

  it("records a recovery code being spent, then signs in", async () => {
    const { deps, events } = harness({ verify: async () => ok("recovery_code" as const) });
    await outcome(handleMfaAction(post("ABCD-EFGH-IJKL-MNOP"), deps));
    expect(events).toEqual(["recovery", "signed-in:staff-1:/internal/shops"]);
  });

  it("asks for a code when none was sent", async () => {
    const { deps, events } = harness();
    expect(await outcome(handleMfaAction(post(), deps))).toEqual({ status: 400, error: "missingCode" });
    expect(events).toEqual([]);
  });

  it("stops at the rate limit before checking anything", async () => {
    let verified = false;
    const { deps } = harness({ limiter: { check: async () => "limited" }, verify: async () => { verified = true; return ok("totp" as const); } });
    expect(await outcome(handleMfaAction(post("123456"), deps))).toEqual({ status: 429, error: "rateLimited" });
    expect(verified).toBe(false);
  });

  it("limits per account and client, so one attacker cannot lock out a colleague", async () => {
    const keys: string[] = [];
    const { deps } = harness({ limiter: { check: async (key) => { keys.push(key); return "allowed"; } } });
    await outcome(handleMfaAction(post("123456"), deps));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^mfa:staff-1:/);
  });

  it("fails closed when MFA cannot be checked (missing or changed key)", async () => {
    const { deps, events } = harness({ verify: async () => err("unavailable") });
    expect(await outcome(handleMfaAction(post("123456"), deps))).toEqual({ status: 503, error: "unavailable" });
    expect(events).toEqual([]);
  });

  it("restarts at the password step when MFA was reset in between, or the account was disabled", async () => {
    const reset = harness({ verify: async () => err("notEnabled") });
    expect(await outcome(handleMfaAction(post("123456"), reset.deps))).toEqual({ status: 302, location: "/internal/login" });
    const disabled = harness({ findUser: async () => ({ ...USER, status: "disabled" }) });
    expect(await outcome(handleMfaAction(post("123456"), disabled.deps))).toEqual({ status: 302, location: "/internal/login" });
    expect([...reset.events, ...disabled.events]).toEqual([]);
  });
});
