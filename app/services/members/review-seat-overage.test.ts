import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { memberSeatEpisodes, shopMembers, shops } from "~/db/schema";
import type { MemberRole } from "~/domain/member-access";
import type { SeatOverageConfig } from "~/domain/member-seat-overage";
import type { OverageLimit } from "~/domain/member-seats";
import { MemberSeatEpisodeRepo } from "~/models/member-seat-episodes.server";
import { MemberRepo } from "~/models/members.server";
import type { MembersSeatsTrimmedPayload, MembersSeatTrimNoticePayload } from "~/notifications/payloads";
import type { SeatShopFacts } from "~/ports/member-seat-overage";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { fakeHandoffNotifier } from "~/test/fake-notifier";
import { sequentialIds } from "~/test/fake-runtime";
import { reviewSeatOverage, type SeatOverageDependencies, type SeatOverageLogEntry } from "./review-seat-overage";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const SHOP = "alpha.myshopify.com";
const OTHER = "beta.myshopify.com";
const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;
const TRIM: SeatOverageConfig = { policy: "notify_then_trim", noticeHours: 72 };

interface SeedMember {
  readonly id: string;
  readonly role: MemberRole;
  readonly email?: string | null;
  readonly name?: string | null;
  readonly lastSeenAt?: number | null;
  readonly createdAt?: number;
  readonly accountOwner?: boolean;
  readonly status?: "active" | "pending" | "removed";
}

async function seedMembers(shop: string, members: readonly SeedMember[]) {
  const row = (member: SeedMember) => ({
    id: member.id,
    shop,
    shopifyUserId: `u-${member.id}`,
    email: member.email === undefined ? `${member.id}@alpha.example` : member.email,
    name: member.name === undefined ? member.id.toUpperCase() : member.name,
    role: member.role,
    status: member.status ?? ("active" as const),
    accountOwner: member.accountOwner ?? false,
    createdAt: member.createdAt ?? 1,
    lastSeenAt: member.lastSeenAt === undefined ? 1 : member.lastSeenAt,
    updatedAt: 1,
  });
  // D1 binds at most 100 variables a statement: a handful of rows at a time.
  for (let from = 0; from < members.length; from += 5) await db.insert(shopMembers).values(members.slice(from, from + 5).map(row));
}

/** One owner and four members: five active people. */
const FIVE: readonly SeedMember[] = [
  { id: "owner", role: "owner" },
  { id: "m1", role: "member", lastSeenAt: 100 },
  { id: "m2", role: "member", lastSeenAt: 200 },
  { id: "m3", role: "member", lastSeenAt: 300 },
  { id: "m4", role: "member", lastSeenAt: 400 },
];

interface Harness {
  readonly deps: SeatOverageDependencies;
  readonly notifier: ReturnType<typeof fakeHandoffNotifier>;
  readonly logs: SeatOverageLogEntry[];
  readonly state: { limit: OverageLimit; shop: SeatShopFacts | undefined };
  readonly episodes: MemberSeatEpisodeRepo;
}

function setup(over: { limit?: OverageLimit; config?: SeatOverageConfig; privilege?: SeatOverageDependencies["privilege"]; shop?: SeatShopFacts | undefined } = {}): Harness {
  const notifier = fakeHandoffNotifier();
  const logs: SeatOverageLogEntry[] = [];
  const episodes = new MemberSeatEpisodeRepo();
  const state = {
    limit: over.limit ?? ({ kind: "limit", maximum: 3 } as OverageLimit),
    shop: "shop" in over ? over.shop : ({ installed: true, name: "Alpha Store", contactEmail: "shop@alpha.example", timeZone: "UTC" } as SeatShopFacts | undefined),
  };
  const deps: SeatOverageDependencies = {
    members: new MemberRepo(),
    episodes,
    seats: { overageLimit: async () => state.limit },
    shops: { facts: async () => state.shop },
    ...(over.privilege ? { privilege: over.privilege } : {}),
    notifier,
    config: over.config ?? TRIM,
    runtime: { ids: sequentialIds("ep") },
    urls: { team: "https://app.example.test/app/members", plan: "https://app.example.test/app/billing" },
    log: (entry) => void logs.push(entry),
  };
  return { deps, notifier, logs, state, episodes };
}

async function seedShop(shop = SHOP) {
  await db.insert(shops).values({ shop, installedAt: 1, relationshipStatus: "INSTALLED" });
}

const statuses = async (shop = SHOP) =>
  Object.fromEntries((await db.select().from(shopMembers)).filter((row) => row.shop === shop).map((row) => [row.id, row.status]));

const notices = (harness: Harness) => harness.notifier.forEvent("members_seat_trim_notice");
const noticePayload = (harness: Harness, index = 0): MembersSeatTrimNoticePayload => {
  const request = notices(harness)[index];
  if (!request) throw new Error("expected a trim notice");
  return request.payload;
};
const trimmedPayload = (harness: Harness, index = 0): MembersSeatsTrimmedPayload => {
  const request = harness.notifier.forEvent("members_seats_trimmed")[index];
  if (!request) throw new Error("expected a trimmed notice");
  return request.payload;
};

describe("under never_remove", () => {
  it("does nothing at all, and asks for nothing, however far over its limit the shop is", async () => {
    const harness = setup({ config: { policy: "never_remove" } });
    const throwing = () => {
      throw new Error("must not be asked");
    };
    const deps: SeatOverageDependencies = {
      ...harness.deps,
      members: { listActive: throwing, trim: throwing },
      episodes: { findOpen: throwing, open: throwing, markNotified: throwing, resolve: throwing, listDue: throwing },
      seats: { overageLimit: throwing },
      shops: { facts: throwing },
    };
    expect(await reviewSeatOverage(SHOP, NOW, deps)).toEqual({ outcome: "policy_off" });
  });

  it("leaves a real over-limit team, with no episode and no mail", async () => {
    const harness = setup({ config: { policy: "never_remove" } });
    await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      await reviewSeatOverage(SHOP, NOW, harness.deps);
      await reviewSeatOverage(SHOP, NOW + 1000 * HOUR, harness.deps);
    });
    expect(await db.select().from(memberSeatEpisodes)).toEqual([]);
    expect(harness.notifier.requests).toEqual([]);
    expect(Object.values(await statuses())).toEqual(["active", "active", "active", "active", "active"]);
  });
});

describe("a shop over its limit", () => {
  it("opens an episode and tells the owner in the same review: who would go, the limit, the count, and when", async () => {
    const harness = setup();
    const outcome = await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      const result = await reviewSeatOverage(SHOP, NOW, harness.deps);
      return { result, open: await harness.episodes.findOpen(SHOP) };
    });
    expect(outcome.result).toEqual({ outcome: "notice_sent" });
    expect(outcome.open).toMatchObject({ detectedAt: NOW, notifiedAt: NOW, deadlineAt: NOW + 72 * HOUR });

    const [request] = notices(harness);
    expect(request).toMatchObject({ event: "members_seat_trim_notice", to: { email: "owner@alpha.example" }, scope: SHOP, dedupeKey: `seat-trim-notice:${SHOP}:${outcome.open?.id}` });
    const payload = noticePayload(harness);
    expect(payload).toMatchObject({ shopName: "Alpha Store", limit: 3, used: 5, deadlineAt: NOW + 72 * HOUR, timeZone: "UTC", morePeople: 0, teamUrl: "https://app.example.test/app/members", planUrl: "https://app.example.test/app/billing" });
    // Five people, three seats: the two members unseen the longest.
    expect(payload.people.map((person) => person.name)).toEqual(["M1", "M2"]);
    expect(harness.logs.map((entry) => entry.event)).toEqual(["member.seat_episode_opened", "member.seat_notice_sent"]);
  });

  it("changes nobody's seat before the deadline", async () => {
    const harness = setup();
    await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      await reviewSeatOverage(SHOP, NOW, harness.deps);
      await reviewSeatOverage(SHOP, NOW + 72 * HOUR - 1, harness.deps);
    });
    expect(Object.values(await statuses())).toEqual(["active", "active", "active", "active", "active"]);
  });

  it("names at most ten people and counts the rest", async () => {
    const harness = setup({ limit: { kind: "limit", maximum: 1 } });
    await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, [{ id: "owner", role: "owner" }, ...Array.from({ length: 14 }, (_, index): SeedMember => ({ id: `p${String(index).padStart(2, "0")}`, role: "viewer" }))]);
      await reviewSeatOverage(SHOP, NOW, harness.deps);
    });
    const payload = noticePayload(harness);
    expect(payload.people).toHaveLength(10);
    expect(payload.morePeople).toBe(4);
  });

  it("sends the notice once per episode however often it is reviewed, and once to each person who can act", async () => {
    const harness = setup();
    await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, [...FIVE, { id: "owner2", role: "owner" }]);
      await reviewSeatOverage(SHOP, NOW, harness.deps);
      await reviewSeatOverage(SHOP, NOW + HOUR, harness.deps);
      await reviewSeatOverage(SHOP, NOW + 2 * HOUR, harness.deps);
    });
    expect(notices(harness).map((request) => request.to.email).sort()).toEqual(["owner2@alpha.example", "owner@alpha.example"]);
    expect(new Set(notices(harness).map((request) => request.dedupeKey)).size).toBe(1);
  });

  it("uses one episode for two reviews that run together, and both notices carry the same key, so the queue sends it once", async () => {
    const harness = setup();
    const open = await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      await Promise.all([reviewSeatOverage(SHOP, NOW, harness.deps), reviewSeatOverage(SHOP, NOW, harness.deps)]);
      return db.select().from(memberSeatEpisodes);
    });
    expect(open).toHaveLength(1);
    expect(new Set(notices(harness).map((request) => `${request.dedupeKey}|${request.to.email}`)).size).toBe(1);
  });
});

describe("a notice that cannot be sent is never followed by a trim", () => {
  it("leaves the episode un-notified when the queue refuses it, and trims nobody however long that lasts", async () => {
    const harness = setup();
    harness.notifier.failing = true;
    const outcome = await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      const first = await reviewSeatOverage(SHOP, NOW, harness.deps);
      const later = await reviewSeatOverage(SHOP, NOW + 1000 * HOUR, harness.deps);
      return { first, later, open: await harness.episodes.findOpen(SHOP) };
    });
    expect(outcome.first).toEqual({ outcome: "notice_failed" });
    expect(outcome.later).toEqual({ outcome: "notice_failed" });
    expect(outcome.open).toMatchObject({ notifiedAt: null, deadlineAt: null });
    expect(Object.values(await statuses())).toEqual(["active", "active", "active", "active", "active"]);
  });

  it("starts the notice period only when the queue takes the notice, counted from then", async () => {
    const harness = setup();
    harness.notifier.failing = true;
    const open = await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      await reviewSeatOverage(SHOP, NOW, harness.deps);
      harness.notifier.failing = false;
      expect(await reviewSeatOverage(SHOP, NOW + 10 * HOUR, harness.deps)).toEqual({ outcome: "notice_sent" });
      return harness.episodes.findOpen(SHOP);
    });
    expect(open).toMatchObject({ notifiedAt: NOW + 10 * HOUR, deadlineAt: NOW + 82 * HOUR });
  });

  it("waits, and trims nobody, for a shop with nobody to tell", async () => {
    const harness = setup({ shop: { installed: true, name: "Alpha Store", contactEmail: null, timeZone: null } });
    const outcome = await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE.map((member) => ({ ...member, email: null })));
      const first = await reviewSeatOverage(SHOP, NOW, harness.deps);
      const later = await reviewSeatOverage(SHOP, NOW + 1000 * HOUR, harness.deps);
      return { first, later, open: await harness.episodes.findOpen(SHOP) };
    });
    expect(outcome.first).toEqual({ outcome: "waiting" });
    expect(outcome.later).toEqual({ outcome: "waiting" });
    expect(outcome.open).toMatchObject({ notifiedAt: null });
    expect(harness.notifier.requests).toEqual([]);
    expect(harness.logs.filter((entry) => entry.event === "member.seat_review_waiting")).toEqual([
      { event: "member.seat_review_waiting", shop: SHOP, reason: "no_recipient" },
      { event: "member.seat_review_waiting", shop: SHOP, reason: "no_recipient" },
    ]);
    expect(Object.values(await statuses())).toEqual(["active", "active", "active", "active", "active"]);
  });

  it("tells the shop's own contact address when no owner or admin has one", async () => {
    const harness = setup();
    await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE.map((member) => ({ ...member, email: null })));
      await reviewSeatOverage(SHOP, NOW, harness.deps);
    });
    expect(notices(harness).map((request) => request.to.email)).toEqual(["shop@alpha.example"]);
  });
});

describe("at the deadline", () => {
  /** A shop whose notice went out at NOW: its deadline is NOW + 72 h. */
  async function noticed(harness: Harness, members: readonly SeedMember[] = FIVE) {
    await seedShop();
    await seedMembers(SHOP, members);
    await reviewSeatOverage(SHOP, NOW, harness.deps);
  }
  const DEADLINE = NOW + 72 * HOUR;

  it("takes exactly active minus limit people, in order, never the owner, marks them, and tells the owner", async () => {
    const harness = setup();
    const outcome = await inRequest(async () => {
      await noticed(harness);
      const result = await reviewSeatOverage(SHOP, DEADLINE, harness.deps);
      return { result, rows: await db.select().from(shopMembers), episode: (await db.select().from(memberSeatEpisodes))[0] };
    });
    expect(outcome.result).toEqual({ outcome: "trimmed" });
    const byId = new Map(outcome.rows.map((row) => [row.id, row]));
    expect(byId.get("m1")).toMatchObject({ status: "pending", trimmedAt: DEADLINE });
    expect(byId.get("m2")).toMatchObject({ status: "pending", trimmedAt: DEADLINE });
    for (const id of ["owner", "m3", "m4"]) expect(byId.get(id)).toMatchObject({ status: "active", trimmedAt: null });
    expect(outcome.episode).toMatchObject({ outcome: "trimmed", trimmedCount: 2, resolvedAt: DEADLINE });
    const trimmed = trimmedPayload(harness);
    expect(trimmed.people.map((person) => person.name)).toEqual(["M1", "M2"]);
    expect(trimmed).toMatchObject({ limit: 3, shopName: "Alpha Store" });
    expect(harness.notifier.forEvent("members_seats_trimmed")[0]).toMatchObject({ to: { email: "owner@alpha.example" }, dedupeKey: `seats-trimmed:${SHOP}:${outcome.episode?.id}` });
  });

  it("does nothing one millisecond before the deadline, and trims exactly at it", async () => {
    const harness = setup();
    const outcome = await inRequest(async () => {
      await noticed(harness);
      const before = await reviewSeatOverage(SHOP, DEADLINE - 1, harness.deps);
      const stillActive = Object.values(await statuses()).filter((status) => status === "active").length;
      const at = await reviewSeatOverage(SHOP, DEADLINE, harness.deps);
      return { before, stillActive, at };
    });
    expect(outcome).toEqual({ before: { outcome: "waiting" }, stillActive: 5, at: { outcome: "trimmed" } });
  });

  it("is done once: a second review finds the shop within its limit and sends and changes nothing", async () => {
    const harness = setup();
    await inRequest(async () => {
      await noticed(harness);
      await reviewSeatOverage(SHOP, DEADLINE, harness.deps);
      expect(await reviewSeatOverage(SHOP, DEADLINE + HOUR, harness.deps)).toEqual({ outcome: "nothing_to_do" });
    });
    expect(harness.notifier.forEvent("members_seats_trimmed")).toHaveLength(1);
    expect((await db.select().from(shopMembers)).filter((row) => row.status === "pending")).toHaveLength(2);
  });

  it("lets two reviews that run together take exactly the two seats and no more, and send one trimmed notice key", async () => {
    const harness = setup();
    const outcome = await inRequest(async () => {
      await noticed(harness);
      await Promise.all([reviewSeatOverage(SHOP, DEADLINE, harness.deps), reviewSeatOverage(SHOP, DEADLINE, harness.deps)]);
      return new MemberRepo().countByStatus(SHOP);
    });
    expect(outcome).toMatchObject({ active: 3, pending: 2 });
    expect(new Set(harness.notifier.forEvent("members_seats_trimmed").map((request) => request.dedupeKey)).size).toBe(1);
  });

  it("takes the people with fewer privileges first when the app supplies scores", async () => {
    const harness = setup({ privilege: { scores: async (_shop, ids) => new Map(ids.map((id) => [id, id === "m1" ? 90 : id === "m4" ? 1 : 50])) } });
    await inRequest(async () => {
      await noticed(harness);
      await reviewSeatOverage(SHOP, DEADLINE, harness.deps);
    });
    // m4 has the lowest score, then m2 and m3 tie (50) and the longest unseen of them goes: m2.
    expect(await statuses()).toMatchObject({ m4: "pending", m2: "pending", m1: "active", m3: "active", owner: "active" });
  });

  it("trims nobody, and says so, when the app's privilege scores cannot be read: the order would be a guess", async () => {
    const harness = setup({ privilege: { scores: async () => { throw new Error("scores down"); } } });
    const outcome = await inRequest(async () => {
      await noticed(harness);
      return { result: await reviewSeatOverage(SHOP, DEADLINE, harness.deps), open: await harness.episodes.findOpen(SHOP) };
    });
    expect(outcome.result).toEqual({ outcome: "waiting" });
    expect(outcome.open).not.toBeUndefined();
    expect(harness.logs).toContainEqual({ event: "member.seat_privilege_unavailable", shop: SHOP });
    expect(Object.values(await statuses()).every((status) => status === "active")).toBe(true);
  });

  it("reads the plan's limit again at that moment: a plan that became unreadable trims nobody and keeps the episode open", async () => {
    const harness = setup();
    const outcome = await inRequest(async () => {
      await noticed(harness);
      harness.state.limit = { kind: "unknown" };
      const result = await reviewSeatOverage(SHOP, DEADLINE + 5 * HOUR, harness.deps);
      return { result, open: await harness.episodes.findOpen(SHOP) };
    });
    expect(outcome.result).toEqual({ outcome: "waiting" });
    expect(outcome.open).toMatchObject({ notifiedAt: NOW });
    expect(Object.values(await statuses()).every((status) => status === "active")).toBe(true);
  });

  it("trims against the plan's limit as it is NOW, not as it was when the episode opened", async () => {
    const harness = setup();
    await inRequest(async () => {
      await noticed(harness);
      // The plan was cut again from three seats to two.
      harness.state.limit = { kind: "limit", maximum: 2 };
      await reviewSeatOverage(SHOP, DEADLINE, harness.deps);
    });
    expect(Object.values(await statuses()).filter((status) => status === "active")).toHaveLength(2);
  });

  it("carries on when the same plan becomes readable again", async () => {
    const harness = setup();
    await inRequest(async () => {
      await noticed(harness);
      harness.state.limit = { kind: "unknown" };
      await reviewSeatOverage(SHOP, DEADLINE, harness.deps);
      harness.state.limit = { kind: "limit", maximum: 3 };
      expect(await reviewSeatOverage(SHOP, DEADLINE + HOUR, harness.deps)).toEqual({ outcome: "trimmed" });
    });
  });

  it("skips the last manager and takes the next candidate, and trims what it can when that is not enough", async () => {
    const harness = setup({ limit: { kind: "limit", maximum: 1 } });
    const outcome = await inRequest(async () => {
      // No owner: the one admin is the only team manager. Three people, one seat.
      await noticed(harness, [{ id: "admin", role: "admin" }, { id: "viewer", role: "viewer" }, { id: "member", role: "member" }]);
      return reviewSeatOverage(SHOP, DEADLINE, harness.deps);
    });
    expect(outcome).toEqual({ outcome: "trimmed" });
    expect(await statuses()).toEqual({ admin: "active", viewer: "pending", member: "pending" });
    expect(harness.logs).toContainEqual({ event: "member.seats_trimmed", shop: SHOP, trimmed: 2, shortfall: 0, announced: true });
  });

  it("leaves the shop alone, with a logged reason, when only protected people are over the limit", async () => {
    const harness = setup({ limit: { kind: "limit", maximum: 1 } });
    const outcome = await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, [{ id: "o1", role: "owner" }, { id: "o2", role: "owner" }, { id: "o3", role: "owner" }]);
      return { result: await reviewSeatOverage(SHOP, NOW, harness.deps), episodes: await db.select().from(memberSeatEpisodes) };
    });
    expect(outcome.result).toEqual({ outcome: "nothing_to_do" });
    expect(outcome.episodes).toEqual([]);
    expect(harness.notifier.requests).toEqual([]);
    expect(harness.logs).toContainEqual({ event: "member.seat_nothing_trimmable", shop: SHOP, active: 3, limit: 1 });
  });
});

describe("an episode that stops being needed", () => {
  it("is cancelled when a seat frees before the deadline, and nobody is touched", async () => {
    const harness = setup();
    const outcome = await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      await reviewSeatOverage(SHOP, NOW, harness.deps);
      // Someone is removed by hand: four people, limit three; then another.
      await new MemberRepo().remove(SHOP, "m1", NOW + HOUR);
      await new MemberRepo().remove(SHOP, "m2", NOW + HOUR);
      const result = await reviewSeatOverage(SHOP, NOW + 100 * HOUR, harness.deps);
      return { result, episode: (await db.select().from(memberSeatEpisodes))[0] };
    });
    expect(outcome.result).toEqual({ outcome: "cancelled" });
    expect(outcome.episode).toMatchObject({ outcome: "cancelled", trimmedCount: null });
    expect(Object.values(await statuses()).filter((status) => status === "pending")).toEqual([]);
    expect(harness.notifier.forEvent("members_seats_trimmed")).toEqual([]);
  });

  it("is cancelled when the plan is upgraded before the deadline, and by an unlimited plan", async () => {
    for (const upgraded of [{ kind: "limit", maximum: 5 }, { kind: "unlimited" }] as const) {
      const harness = setup();
      await inRequest(async () => {
        await seedShop();
        await seedMembers(SHOP, FIVE);
        await reviewSeatOverage(SHOP, NOW, harness.deps);
        harness.state.limit = upgraded;
        expect(await reviewSeatOverage(SHOP, NOW + HOUR, harness.deps)).toEqual({ outcome: "cancelled" });
      });
      expect((await db.select().from(memberSeatEpisodes))[0]).toMatchObject({ outcome: "cancelled" });
      await db.delete(memberSeatEpisodes);
      await db.delete(shopMembers);
      await db.delete(shops);
    }
  });

  it("is cancelled for a shop the app was uninstalled from, and none is opened for one", async () => {
    const harness = setup();
    const outcome = await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      await reviewSeatOverage(SHOP, NOW, harness.deps);
      harness.state.shop = { installed: false, name: null, contactEmail: null, timeZone: null };
      const cancelled = await reviewSeatOverage(SHOP, NOW + 100 * HOUR, harness.deps);
      const again = await reviewSeatOverage(SHOP, NOW + 200 * HOUR, harness.deps);
      return { cancelled, again, episodes: await db.select().from(memberSeatEpisodes) };
    });
    expect(outcome.cancelled).toEqual({ outcome: "cancelled" });
    expect(outcome.again).toEqual({ outcome: "nothing_to_do" });
    expect(outcome.episodes).toHaveLength(1);
    expect(Object.values(await statuses()).every((status) => status === "active")).toBe(true);
  });

  it("is not opened for a shop the app holds no record of", async () => {
    const harness = setup({ shop: undefined });
    await inRequest(async () => {
      await seedMembers(SHOP, FIVE);
      expect(await reviewSeatOverage(SHOP, NOW, harness.deps)).toEqual({ outcome: "nothing_to_do" });
    });
    expect(await db.select().from(memberSeatEpisodes)).toEqual([]);
  });

  it("opens a fresh episode, with a fresh notice, if the shop goes over again later", async () => {
    const harness = setup();
    await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      await reviewSeatOverage(SHOP, NOW, harness.deps);
      harness.state.limit = { kind: "limit", maximum: 5 };
      await reviewSeatOverage(SHOP, NOW + HOUR, harness.deps);
      harness.state.limit = { kind: "limit", maximum: 3 };
      await reviewSeatOverage(SHOP, NOW + 2 * HOUR, harness.deps);
    });
    expect(await db.select().from(memberSeatEpisodes)).toHaveLength(2);
    expect(new Set(notices(harness).map((request) => request.dedupeKey)).size).toBe(2);
  });
});

describe("a limit that cannot be read", () => {
  it("opens no episode and sends nothing, whatever the team looks like: a refusal is never a limit of zero", async () => {
    const harness = setup({ limit: { kind: "unknown" } });
    await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      expect(await reviewSeatOverage(SHOP, NOW, harness.deps)).toEqual({ outcome: "nothing_to_do" });
    });
    expect(await db.select().from(memberSeatEpisodes)).toEqual([]);
    expect(harness.notifier.requests).toEqual([]);
    expect(Object.values(await statuses()).every((status) => status === "active")).toBe(true);
  });
});

describe("shops are kept apart", () => {
  it("reviews one shop without opening an episode for, or touching, another that is over its limit", async () => {
    const harness = setup({ limit: { kind: "limit", maximum: 4 } });
    await inRequest(async () => {
      await seedShop(SHOP);
      await seedShop(OTHER);
      await seedMembers(SHOP, FIVE.slice(0, 3));
      await seedMembers(OTHER, FIVE.map((member) => ({ ...member, id: `b-${member.id}` })));
      expect(await reviewSeatOverage(SHOP, NOW, harness.deps)).toEqual({ outcome: "nothing_to_do" });
    });
    expect(await db.select().from(memberSeatEpisodes)).toEqual([]);
    expect(await statuses(OTHER)).toMatchObject({ "b-m1": "active", "b-m4": "active" });
    expect(harness.notifier.requests).toEqual([]);
  });

  it("trims and notifies only the shop it was asked about", async () => {
    const harness = setup();
    await inRequest(async () => {
      await seedShop(SHOP);
      await seedShop(OTHER);
      await seedMembers(SHOP, FIVE);
      await seedMembers(OTHER, FIVE.map((member) => ({ ...member, id: `b-${member.id}`, email: `${member.id}@beta.example` })));
      await reviewSeatOverage(SHOP, NOW, harness.deps);
      await reviewSeatOverage(SHOP, NOW + 72 * HOUR, harness.deps);
    });
    expect(Object.values(await statuses(OTHER)).every((status) => status === "active")).toBe(true);
    expect(harness.notifier.requests.every((request) => request.scope === SHOP)).toBe(true);
    expect((await db.select().from(memberSeatEpisodes)).map((row) => row.shop)).toEqual([SHOP]);
  });
});

describe("what the log carries", () => {
  it("names counts and reasons, never a name or an address", async () => {
    const harness = setup();
    await inRequest(async () => {
      await seedShop();
      await seedMembers(SHOP, FIVE);
      await reviewSeatOverage(SHOP, NOW, harness.deps);
      await reviewSeatOverage(SHOP, NOW + 72 * HOUR, harness.deps);
    });
    const text = JSON.stringify(harness.logs);
    expect(text).not.toContain("@");
    for (const name of ["OWNER", "M1", "M2", "Alpha Store"]) expect(text).not.toContain(name);
  });
});
