import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memberSeatEpisodes, shopMembers, shops, shopifySyncCheckpoints } from "~/db/schema";
import { SEAT_SCAN_CHECKPOINT, type SeatOverageConfig } from "~/domain/member-seat-overage";
import { MEMBERS } from "~/members/config";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { fakeHandoffNotifier } from "~/test/fake-notifier";
import { afterPlanChange, memberSeatOverageSweep, seatOverageDependencies, seatScanCursor } from "./member-seat-overage.server";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const SHOP = "alpha.myshopify.com";
const TRIM: SeatOverageConfig = { policy: "notify_then_trim", noticeHours: 24 };

async function seedOverLimitShop() {
  await db.insert(shops).values({ shop: SHOP, name: "Alpha", installedAt: 1, relationshipStatus: "INSTALLED" });
  await db.insert(shopMembers).values([
    { id: "o", shop: SHOP, shopifyUserId: "uo", email: "owner@alpha.example", name: "Olu", role: "owner", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 1 },
    { id: "m1", shop: SHOP, shopifyUserId: "u1", email: "m1@alpha.example", name: "M1", role: "member", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 1 },
    { id: "m2", shop: SHOP, shopifyUserId: "u2", email: "m2@alpha.example", name: "M2", role: "member", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 2 },
  ]);
}

afterEach(() => vi.restoreAllMocks());

describe("the shipped app removes nobody", () => {
  it("is configured never_remove", () => {
    expect(MEMBERS.seatOverage).toEqual({ policy: "never_remove" });
  });

  it("does not build the review's dependencies or look at the shop when a plan changes", async () => {
    const make = vi.fn(() => {
      throw new Error("must not be built");
    });
    await inRequest(async () => {
      await seedOverLimitShop();
      await afterPlanChange(SHOP, { policy: "never_remove" }, make);
    });
    expect(make).not.toHaveBeenCalled();
    expect(await db.select().from(memberSeatEpisodes)).toEqual([]);
  });

  it("makes the cron sweep a no-op that writes no cursor and opens no episode", async () => {
    const result = await inRequest(async () => {
      await seedOverLimitShop();
      return memberSeatOverageSweep().run(1_700_000_000_000);
    });
    expect(result).toEqual({ policy_off: 1 });
    expect(await db.select().from(shopifySyncCheckpoints)).toEqual([]);
    expect(await db.select().from(memberSeatEpisodes)).toEqual([]);
  });
});

describe("when a plan changes for an app that trims", () => {
  it("reviews the shop's seats: the episode opens and the notice is handed over", async () => {
    const notifier = fakeHandoffNotifier();
    await inRequest(async () => {
      await seedOverLimitShop();
      await afterPlanChange(SHOP, TRIM, () => ({ ...seatOverageDependencies(TRIM), seats: { overageLimit: async () => ({ kind: "limit", maximum: 2 }) }, notifier }));
    });
    expect(await db.select().from(memberSeatEpisodes)).toMatchObject([{ shop: SHOP, notifiedAt: expect.any(Number) }]);
    expect(notifier.forEvent("members_seat_trim_notice").map((request) => request.to.email)).toEqual(["owner@alpha.example"]);
  });

  it("never fails the plan change when the review does: the failure is logged by shop hash and the call returns", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await inRequest(async () => {
      await seedOverLimitShop();
      await expect(
        afterPlanChange(SHOP, TRIM, () => ({
          ...seatOverageDependencies(TRIM),
          members: { ...seatOverageDependencies(TRIM).members, listActive: async () => { throw new Error("d1 down"); } },
        })),
      ).resolves.toBeUndefined();
    });
    const lines = log.mock.calls.map(([line]) => String(line));
    expect(lines.some((line) => line.includes('"event":"member.seat_review_failed"') && line.includes('"trigger":"plan_change"'))).toBe(true);
    expect(lines.join("\n")).not.toContain(SHOP);
  });

  it("with the real wiring and no readable plan for the shop, trims nobody and sends nothing", async () => {
    await inRequest(async () => {
      await seedOverLimitShop();
      // No subscription was ever observed: the plan is unreadable, which is a refusal and never a limit of zero.
      await afterPlanChange(SHOP, TRIM);
    });
    expect(await db.select().from(memberSeatEpisodes)).toEqual([]);
    expect((await db.select().from(shopMembers)).every((row) => row.status === "active")).toBe(true);
  });
});

describe("the scan's cursor", () => {
  it("is kept in the one global checkpoint row, read back, and cleared by writing null", async () => {
    const outcome = await inRequest(async () => {
      const cursor = seatScanCursor();
      const initial = await cursor.read();
      await cursor.write("m.myshopify.com", 5);
      const written = await cursor.read();
      await cursor.write(null, 6);
      return { initial, written, cleared: await cursor.read(), rows: await db.select().from(shopifySyncCheckpoints) };
    });
    expect(outcome.initial).toBeNull();
    expect(outcome.written).toBe("m.myshopify.com");
    expect(outcome.cleared).toBeNull();
    expect(outcome.rows).toMatchObject([{ name: SEAT_SCAN_CHECKPOINT, cursor: null, lastSucceededAt: 6 }]);
  });
});
