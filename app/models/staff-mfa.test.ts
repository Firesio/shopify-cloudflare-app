import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { AdminUserRepo } from "./admin-users.server";
import { StaffMfaRepo } from "./staff-mfa.server";

setupTestDatabase();

const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

async function staff(id: string) {
  await new AdminUserRepo().create({ id, email: `${id}@team.dev`, name: id, passwordHash: "x", role: "admin", now: 1 });
}

describe("StaffMfaRepo", () => {
  it("promotes a pending secret only while it is still the pending one", async () => {
    const result = await inRequest(async () => {
      await staff("a");
      const repo = new StaffMfaRepo();
      await repo.savePending("a", "v1.first", 10);
      await repo.savePending("a", "v1.second", 11);
      const stale = await repo.confirm("a", "v1.first", 5, ["h1"], 12);
      const fresh = await repo.confirm("a", "v1.second", 5, ["h1", "h2"], 13);
      return { stale, fresh, state: await repo.find("a"), codes: await repo.countUnusedRecoveryCodes("a") };
    });
    expect(result.stale).toBe(false);
    expect(result.fresh).toBe(true);
    expect(result.state).toEqual({ secret: "v1.second", pendingSecret: null, pendingCreatedAt: null, enabledAt: 13, lastStep: 5 });
    expect(result.codes).toBe(2);
  });

  it("accepts a step only when it is newer than the last one", async () => {
    const claims = await inRequest(async () => {
      await staff("b");
      const repo = new StaffMfaRepo();
      await repo.savePending("b", "v1.s", 1);
      await repo.confirm("b", "v1.s", 100, [], 1);
      return [await repo.claimStep("b", 100, 2), await repo.claimStep("b", 99, 2), await repo.claimStep("b", 101, 2), await repo.claimStep("b", 101, 3)];
    });
    expect(claims).toEqual([false, false, true, false]);
  });

  it("spends a recovery code once, and only for its owner", async () => {
    const spent = await inRequest(async () => {
      await staff("c");
      await staff("d");
      const repo = new StaffMfaRepo();
      await repo.replaceRecoveryCodes("c", ["hash-c"], 1);
      return [await repo.useRecoveryCode("d", "hash-c", 2), await repo.useRecoveryCode("c", "hash-c", 2), await repo.useRecoveryCode("c", "hash-c", 3)];
    });
    expect(spent).toEqual([false, true, false]);
  });

  it("replacing codes drops the old ones", async () => {
    const result = await inRequest(async () => {
      await staff("e");
      const repo = new StaffMfaRepo();
      await repo.replaceRecoveryCodes("e", ["old-1", "old-2"], 1);
      await repo.replaceRecoveryCodes("e", ["new-1"], 2);
      return { old: await repo.useRecoveryCode("e", "old-1", 3), fresh: await repo.useRecoveryCode("e", "new-1", 3) };
    });
    expect(result).toEqual({ old: false, fresh: true });
  });

  it("remove clears the secret and every code; deleting the staff account cascades", async () => {
    const result = await inRequest(async () => {
      await staff("f");
      await staff("g");
      const repo = new StaffMfaRepo();
      for (const id of ["f", "g"]) {
        await repo.savePending(id, "v1.s", 1);
        await repo.confirm(id, "v1.s", 1, [`${id}-code`], 1);
      }
      await repo.remove("f");
      await new AdminUserRepo().remove("g");
      return { f: await repo.find("f"), fCodes: await repo.countUnusedRecoveryCodes("f"), g: await repo.find("g"), gCodes: await repo.countUnusedRecoveryCodes("g") };
    });
    expect(result).toEqual({ f: undefined, fCodes: 0, g: undefined, gCodes: 0 });
  });
});
