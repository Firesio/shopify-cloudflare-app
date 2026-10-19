import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { AdminUserRepo } from "~/models/admin-users.server";
import { StaffAuditLogRepo } from "~/models/staff-audit-logs.server";
import { StaffMfaRepo } from "~/models/staff-mfa.server";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { fakeRuntime } from "~/test/fake-runtime";
import { resetAdminMfa } from "./admin-management.server";
import { isMfaEnabled } from "./staff-mfa";

setupTestDatabase();

const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

async function seed() {
  const users = new AdminUserRepo();
  await users.create({ id: "owner", email: "owner@team.dev", name: "Olu", passwordHash: "x", role: "owner", now: 1 });
  await users.create({ id: "lost", email: "lost@team.dev", name: "Lee", passwordHash: "x", role: "admin", now: 1 });
  const store = new StaffMfaRepo();
  await store.savePending("lost", "v1.s", 1);
  await store.confirm("lost", "v1.s", 1, ["code"], 1);
  return { users, store, deps: { users, mfa: { store }, audit: { log: new StaffAuditLogRepo(), runtime: fakeRuntime() } } };
}

describe("resetAdminMfa", () => {
  it("turns a colleague's MFA off and records who did it to whom", async () => {
    const result = await inRequest(async () => {
      const { store, deps } = await seed();
      const reset = await resetAdminMfa({ actorId: "owner", targetId: "lost" }, deps);
      return {
        reset: reset.ok && reset.value.email,
        enabled: await isMfaEnabled("lost", { store }),
        codes: await store.countUnusedRecoveryCodes("lost"),
        trail: (await new StaffAuditLogRepo().recent(5)).map(({ kind, actorEmail, path }) => ({ kind, actorEmail, path })),
      };
    });
    expect(result).toEqual({
      reset: "lost@team.dev",
      enabled: false,
      codes: 0,
      trail: [{ kind: "mfa_reset", actorEmail: "owner@team.dev", path: "/internal/admins/lost" }],
    });
  });

  it("refuses one's own account (that needs a code on the profile page) and unknown accounts", async () => {
    const result = await inRequest(async () => {
      const { store, deps } = await seed();
      return {
        self: await resetAdminMfa({ actorId: "lost", targetId: "lost" }, deps),
        unknown: await resetAdminMfa({ actorId: "owner", targetId: "nobody" }, deps),
        stillOn: await isMfaEnabled("lost", { store }),
      };
    });
    expect(result).toEqual({ self: { ok: false, reason: "notYourself" }, unknown: { ok: false, reason: "notFound" }, stillOn: true });
  });
});
