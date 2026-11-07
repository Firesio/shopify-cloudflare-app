import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { memberSeatEpisodes, shopMembers, shops } from "~/db/schema";
import type { SeatOverageConfig } from "~/domain/member-seat-overage";
import type { OverageLimit } from "~/domain/member-seats";
import { MemberSeatEpisodeRepo } from "~/models/member-seat-episodes.server";
import { MemberRepo } from "~/models/members.server";
import type { SeatScanCursor } from "~/ports/member-seat-overage";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { fakeHandoffNotifier } from "~/test/fake-notifier";
import { sequentialIds } from "~/test/fake-runtime";
import type { SeatOverageLogEntry } from "./review-seat-overage";
import { SEAT_SWEEP_BATCH, sweepSeatOverage, type SeatSweepDependencies } from "./sweep-seat-overage";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;
const TRIM: SeatOverageConfig = { policy: "notify_then_trim", noticeHours: 72 };
const shopName = (index: number) => `s${String(index).padStart(3, "0")}.myshopify.com`;

/** An installed shop with an owner and `extra` plain members. */
async function seedShopWithTeam(shop: string, extra: number) {
  await db.insert(shops).values({ shop, installedAt: 1, relationshipStatus: "INSTALLED" });
  await db.insert(shopMembers).values({ id: `${shop}-owner`, shop, shopifyUserId: `${shop}-uo`, email: `owner@${shop}`, name: "Owner", role: "owner", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 1 });
  for (let index = 0; index < extra; index += 1) {
    await db.insert(shopMembers).values({ id: `${shop}-m${index}`, shop, shopifyUserId: `${shop}-u${index}`, email: `m${index}@${shop}`, name: `M${index}`, role: "member", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 10 + index });
  }
}

function memoryCursor(initial: string | null = null): SeatScanCursor & { value: string | null; writes: number } {
  const cursor = {
    value: initial,
    writes: 0,
    read: async () => cursor.value,
    write: async (next: string | null) => {
      cursor.value = next;
      cursor.writes += 1;
    },
  };
  return cursor;
}

function setup(over: { config?: SeatOverageConfig; limit?: (shop: string) => OverageLimit | Error; cursor?: ReturnType<typeof memoryCursor> } = {}) {
  const notifier = fakeHandoffNotifier();
  const logs: SeatOverageLogEntry[] = [];
  const cursor = over.cursor ?? memoryCursor();
  const deps: SeatSweepDependencies = {
    members: new MemberRepo(),
    episodes: new MemberSeatEpisodeRepo(),
    seats: {
      overageLimit: async (shop) => {
        const limit = over.limit?.(shop) ?? ({ kind: "limit", maximum: 2 } as OverageLimit);
        if (limit instanceof Error) throw limit;
        return limit;
      },
    },
    shops: { facts: async () => ({ installed: true, name: "Shop", contactEmail: null, timeZone: null }) },
    notifier,
    config: over.config ?? TRIM,
    runtime: { ids: sequentialIds("ep") },
    urls: { team: "https://app.example.test/app/members", plan: "https://app.example.test/app/billing" },
    scan: cursor,
    log: (entry) => void logs.push(entry),
  };
  return { deps, notifier, logs, cursor };
}

describe("under never_remove", () => {
  it("returns at once: no episode is listed, no shop scanned, no cursor read or written, nothing changed", async () => {
    const throwing = () => {
      throw new Error("must not be asked");
    };
    const { deps } = setup({ config: { policy: "never_remove" } });
    const result = await sweepSeatOverage(NOW, {
      ...deps,
      members: { listActive: throwing, trim: throwing, listShopsWithSeveralActive: throwing },
      episodes: { findOpen: throwing, open: throwing, markNotified: throwing, resolve: throwing, listDue: throwing },
      scan: { read: throwing, write: throwing },
    });
    expect(result).toEqual({ policy_off: 1 });
  });

  it("leaves a shop that is over its limit, and an episode past its deadline, exactly as they were", async () => {
    const { deps, notifier, cursor } = setup({ config: { policy: "never_remove" } });
    await inRequest(async () => {
      await seedShopWithTeam(shopName(1), 4);
      await db.insert(memberSeatEpisodes).values({ id: "old", shop: shopName(1), detectedAt: 1, notifiedAt: 2, deadlineAt: 3 });
      await sweepSeatOverage(NOW, deps);
    });
    expect((await db.select().from(shopMembers)).every((row) => row.status === "active")).toBe(true);
    expect(await db.select().from(memberSeatEpisodes)).toMatchObject([{ id: "old", resolvedAt: null }]);
    expect(notifier.requests).toEqual([]);
    expect(cursor.writes).toBe(0);
  });
});

describe("under notify_then_trim", () => {
  it("finds a shop that went over its limit with no plan change, and tells it", async () => {
    const { deps, notifier, cursor } = setup();
    const result = await inRequest(async () => {
      await seedShopWithTeam(shopName(1), 4); // five active, limit two
      await seedShopWithTeam(shopName(2), 1); // two active: within the limit
      return sweepSeatOverage(NOW, deps);
    });
    expect(result).toMatchObject({ due: 0, scanned: 2, notice_sent: 1, nothing_to_do: 1 });
    expect(notifier.forEvent("members_seat_trim_notice").map((request) => request.scope)).toEqual([shopName(1)]);
    expect(await db.select().from(memberSeatEpisodes)).toMatchObject([{ shop: shopName(1), notifiedAt: NOW, deadlineAt: NOW + 72 * HOUR }]);
    // A short batch is the end of the list: the next tick starts from the top.
    expect(cursor.value).toBeNull();
  });

  it("finishes an episode whose deadline passed, even for a shop the scan would not reach", async () => {
    const { deps } = setup();
    await inRequest(async () => {
      await seedShopWithTeam(shopName(1), 4);
      await sweepSeatOverage(NOW, deps);
    });
    // 72 hours later the same sweep trims.
    const result = await inRequest(() => sweepSeatOverage(NOW + 72 * HOUR, deps));
    expect(result).toMatchObject({ due: 1, trimmed: 1 });
    expect((await db.select().from(shopMembers)).filter((row) => row.status === "pending")).toHaveLength(3);
    expect(await db.select().from(memberSeatEpisodes)).toMatchObject([{ outcome: "trimmed", trimmedCount: 3 }]);
  });

  it("retries a notice that could not be sent, every tick, without trimming", async () => {
    const { deps, notifier } = setup();
    notifier.failing = true;
    await inRequest(async () => {
      await seedShopWithTeam(shopName(1), 4);
      const first = await sweepSeatOverage(NOW, deps);
      const second = await sweepSeatOverage(NOW + 100 * HOUR, deps);
      expect(first).toMatchObject({ notice_failed: 1 });
      expect(second).toMatchObject({ due: 1, notice_failed: 1 });
      notifier.failing = false;
      expect(await sweepSeatOverage(NOW + 101 * HOUR, deps)).toMatchObject({ due: 1, notice_sent: 1 });
    });
    expect((await db.select().from(shopMembers)).every((row) => row.status === "active")).toBe(true);
  });

  it("reviews each shop once per tick even when it is both due and in the scan", async () => {
    const { deps, notifier } = setup();
    await inRequest(async () => {
      await seedShopWithTeam(shopName(1), 4);
      await sweepSeatOverage(NOW, deps);
      await sweepSeatOverage(NOW + 72 * HOUR, deps);
    });
    expect(notifier.forEvent("members_seats_trimmed").length).toBe(1);
  });

  it("looks at no more than a batch of shops a tick, resumes from the cursor, and starts over at the end", async () => {
    const { deps, cursor } = setup();
    const total = SEAT_SWEEP_BATCH + 3;
    await inRequest(async () => {
      for (let start = 0; start < total; start += 1) await seedShopWithTeam(shopName(start), 1);
      const first = await sweepSeatOverage(NOW, deps);
      expect(first).toMatchObject({ scanned: SEAT_SWEEP_BATCH });
      expect(cursor.value).toBe(shopName(SEAT_SWEEP_BATCH - 1));
      const second = await sweepSeatOverage(NOW + HOUR, deps);
      expect(second).toMatchObject({ scanned: 3 });
      expect(cursor.value).toBeNull();
      const third = await sweepSeatOverage(NOW + 2 * HOUR, deps);
      expect(third).toMatchObject({ scanned: SEAT_SWEEP_BATCH });
    });
  });

  it("skips shops the app is not installed on, and shops with one active member", async () => {
    const { deps } = setup();
    const result = await inRequest(async () => {
      await seedShopWithTeam(shopName(1), 4);
      await db.update(shops).set({ relationshipStatus: "UNINSTALLED" });
      await seedShopWithTeam(shopName(2), 0);
      return sweepSeatOverage(NOW, deps);
    });
    expect(result).toMatchObject({ scanned: 0 });
    expect(await db.select().from(memberSeatEpisodes)).toEqual([]);
  });

  it("lets one shop's failure cost the others nothing, and says which kind of failure without naming anyone", async () => {
    const { deps, logs, notifier } = setup({ limit: (shop) => (shop === shopName(1) ? new Error("plan lookup exploded") : ({ kind: "limit", maximum: 2 } as OverageLimit)) });
    const result = await inRequest(async () => {
      await seedShopWithTeam(shopName(1), 4);
      await seedShopWithTeam(shopName(2), 4);
      return sweepSeatOverage(NOW, deps);
    });
    expect(result).toMatchObject({ failed: 1, notice_sent: 1 });
    expect(notifier.forEvent("members_seat_trim_notice").map((request) => request.scope)).toEqual([shopName(2)]);
    expect(logs).toContainEqual({ event: "member.seat_review_failed", shop: shopName(1), reason: "Error" });
  });

  it("trims nobody in a shop whose plan cannot be read, whatever the sweep finds", async () => {
    const { deps, notifier } = setup({ limit: () => ({ kind: "unknown" }) });
    await inRequest(async () => {
      await seedShopWithTeam(shopName(1), 4);
      await sweepSeatOverage(NOW, deps);
      await sweepSeatOverage(NOW + 1000 * HOUR, deps);
    });
    expect((await db.select().from(shopMembers)).every((row) => row.status === "active")).toBe(true);
    expect(await db.select().from(memberSeatEpisodes)).toEqual([]);
    expect(notifier.requests).toEqual([]);
  });
});
