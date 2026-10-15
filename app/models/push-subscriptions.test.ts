import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { defined } from "~/test/defined";
import { AdminUserRepo } from "./admin-users.server";
import { PushSubscriptionRepo } from "./push-subscriptions.server";
import type { NewPushSubscription } from "~/ports/push-subscriptions";

setupTestDatabase();

const run = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);
const NOW = 1_700_000_000_000;

async function admin(id: string) {
  await new AdminUserRepo().create({ id, email: `${id}@workmanjsc.vn`, name: id, passwordHash: "x", role: "admin", now: NOW });
}

function device(id: string, endpoint: string, over: Partial<NewPushSubscription> = {}): NewPushSubscription {
  return { id, endpoint, p256dh: "key", auth: "auth", label: "Chrome on Android", kind: "phone", now: NOW, ...over };
}

describe("PushSubscriptionRepo", () => {
  it("registers a device, lists it with its keys and counts it", async () => {
    await run(async () => {
      await admin("a");
      const repo = new PushSubscriptionRepo();
      await repo.upsert("a", device("d1", "https://fcm.googleapis.com/1"));
      expect(await repo.countForAdmin("a")).toBe(1);
      expect(await repo.listForAdmin("a")).toEqual([
        {
          id: "d1", adminUserId: "a", endpoint: "https://fcm.googleapis.com/1", p256dh: "key", auth: "auth",
          label: "Chrome on Android", kind: "phone", enabled: true, createdAt: NOW, lastUsedAt: null,
        },
      ]);
    });
  });

  it("registering the same endpoint again refreshes it instead of duplicating it, and keeps the id", async () => {
    await run(async () => {
      await admin("a");
      const repo = new PushSubscriptionRepo();
      await repo.upsert("a", device("d1", "https://fcm.googleapis.com/1"));
      await repo.setEnabled("a", "d1", false);
      await repo.markUsed("d1", NOW + 5);
      await repo.upsert("a", device("d2", "https://fcm.googleapis.com/1", { p256dh: "new", auth: "newauth", label: "Edge on Windows", kind: "desktop", now: NOW + 10 }));
      const rows = await repo.listForAdmin("a");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: "d1", p256dh: "new", auth: "newauth", label: "Edge on Windows", kind: "desktop", enabled: true, createdAt: NOW + 10, lastUsedAt: null });
    });
  });

  it("lists in registration order", async () => {
    await run(async () => {
      await admin("a");
      const repo = new PushSubscriptionRepo();
      await repo.upsert("a", device("late", "https://fcm.googleapis.com/late", { now: NOW + 2 }));
      await repo.upsert("a", device("early", "https://fcm.googleapis.com/early", { now: NOW + 1 }));
      expect((await repo.listForAdmin("a")).map((row) => row.id)).toEqual(["early", "late"]);
    });
  });

  it("switches a device off and on, and removes it", async () => {
    await run(async () => {
      await admin("a");
      const repo = new PushSubscriptionRepo();
      await repo.upsert("a", device("d1", "https://fcm.googleapis.com/1"));
      expect(await repo.setEnabled("a", "d1", false)).toBe(true);
      expect((await repo.findById("d1"))?.enabled).toBe(false);
      expect(await repo.setEnabled("a", "d1", true)).toBe(true);
      expect((await repo.findById("d1"))?.enabled).toBe(true);
      expect(await repo.remove("a", "d1")).toBe(true);
      expect(await repo.findById("d1")).toBeUndefined();
      expect(await repo.remove("a", "d1")).toBe(false);
      expect(await repo.setEnabled("a", "d1", true)).toBe(false);
    });
  });

  it("the system can drop and mark a device by id alone", async () => {
    await run(async () => {
      await admin("a");
      const repo = new PushSubscriptionRepo();
      await repo.upsert("a", device("d1", "https://fcm.googleapis.com/1"));
      await repo.markUsed("d1", NOW + 99);
      expect((await repo.findById("d1"))?.lastUsedAt).toBe(NOW + 99);
      await repo.removeById("d1");
      expect(await repo.findById("d1")).toBeUndefined();
      await expect(repo.removeById("missing")).resolves.toBeUndefined();
    });
  });

  it("deleting an admin deletes their devices", async () => {
    await run(async () => {
      await admin("a");
      const repo = new PushSubscriptionRepo();
      await repo.upsert("a", device("d1", "https://fcm.googleapis.com/1"));
      await new AdminUserRepo().remove("a");
      expect(await repo.findById("d1")).toBeUndefined();
    });
  });

  describe("across admins", () => {
    it("admin B cannot list, switch or remove admin A's device", async () => {
      await run(async () => {
        await admin("a");
        await admin("b");
        const repo = new PushSubscriptionRepo();
        await repo.upsert("a", device("d1", "https://fcm.googleapis.com/a"));

        expect(await repo.listForAdmin("b")).toEqual([]);
        expect(await repo.countForAdmin("b")).toBe(0);
        expect(await repo.setEnabled("b", "d1", false)).toBe(false);
        expect(await repo.remove("b", "d1")).toBe(false);

        expect(defined(await repo.findById("d1"))).toMatchObject({ adminUserId: "a", enabled: true });
        expect(await repo.listForAdmin("a")).toHaveLength(1);
      });
    });

    it("an endpoint registered by B moves it, and A no longer has it", async () => {
      await run(async () => {
        await admin("a");
        await admin("b");
        const repo = new PushSubscriptionRepo();
        await repo.upsert("a", device("d1", "https://fcm.googleapis.com/shared"));
        await repo.upsert("b", device("d2", "https://fcm.googleapis.com/shared", { now: NOW + 1 }));

        expect(await repo.listForAdmin("a")).toEqual([]);
        expect(await repo.countForAdmin("a")).toBe(0);
        const [moved] = await repo.listForAdmin("b");
        expect(moved).toMatchObject({ id: "d1", adminUserId: "b" });
        // A can no longer act on it through the admin-scoped methods.
        expect(await repo.remove("a", "d1")).toBe(false);
      });
    });
  });
});
