import { describe, expect, it, vi } from "vitest";
import { handleLoginAction } from "./login.server";
import type { AuthAttemptLimiter } from "~/ports/auth-rate-limit";

type ActionResponse = { status: number; error?: unknown };
type VerifyCredentials = Parameters<typeof handleLoginAction>[1]["verifyCredentials"];

const noSuchAccount: VerifyCredentials = async () => ({ ok: false, reason: "invalidCredentials" });

async function submit(
  ip: string,
  limiter: AuthAttemptLimiter,
  productionLike = false,
  verifyCredentials: VerifyCredentials = noSuchAccount,
): Promise<ActionResponse> {
  const form = new FormData();
  form.set("email", "nobody@example.org");
  form.set("password", "not-a-real-password");
  const request = new Request("https://example.test/internal/login", {
    method: "POST",
    body: form,
    headers: { "CF-Connecting-IP": ip },
  });
  const result = await handleLoginAction(request, {
    limiter,
    productionLike,
    verifyCredentials,
    createSession: async () => new Response(null, { status: 302 }),
  });
  if (result instanceof Response) return { status: result.status };
  if (result && typeof result === "object" && "status" in result) return { status: Number(result.status) };
  if (result && typeof result === "object" && "init" in result) {
    const init = result.init;
    const error = "data" in result && result.data && typeof result.data === "object" && "error" in result.data ? result.data.error : undefined;
    if (init && typeof init === "object" && "status" in init) return { status: Number(init.status), error };
  }
  throw new Error(`Expected the action response: ${JSON.stringify(result)}`);
}

describe("internal login rate limiting", () => {
  it("rejects the sixth attempt from one client before credential verification", async () => {
    const ip = "203.0.113.91";
    let attempts = 0;
    const limiter: AuthAttemptLimiter = { check: async () => {
      attempts += 1;
      return attempts > 5 ? "limited" : "allowed";
    } };
    const statuses: ActionResponse[] = [];
    for (let index = 0; index < 6; index += 1) statuses.push(await submit(ip, limiter));

    expect(statuses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 429]);
    expect(attempts).toBe(6);
  });

  it("returns 503 in production-like configuration when the limiter is unavailable", async () => {
    const limiter: AuthAttemptLimiter = { check: async () => "unavailable" };
    const response = await submit("203.0.113.92", limiter, true);

    // A message on the sign-in form, not a bare text response that skips the page.
    expect(response).toEqual({ status: 503, error: "serviceUnavailable" });
  });

  it("shows a sign-in error instead of the error page when verification itself fails", async () => {
    // Production on 2026-10-14: WebCrypto refused the PBKDF2 iteration count and every sign-in became a 500 page.
    const limiter: AuthAttemptLimiter = { check: async () => "allowed" };
    const throwing: VerifyCredentials = async () => {
      throw new Error("Pbkdf2 failed: iteration counts above 100000 are not supported");
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await submit("203.0.113.94", limiter, true, throwing);

    expect(response).toEqual({ status: 500, error: "unexpected" });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('"event":"admin_login.failed"'));
    logged.mockRestore();
  });

  it("keeps local development usable when the limiter is unavailable", async () => {
    const limiter: AuthAttemptLimiter = { check: async () => "unavailable" };
    const response = await submit("203.0.113.93", limiter);

    expect(response.status).toBe(401);
  });
});
