import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { shopMembers, shops } from "~/db/schema";
import type { AdmissionConfig } from "~/domain/member-admission";
import { customPolicy } from "~/domain/member-permissions";
import type { SeatLimit } from "~/domain/member-seats";
import type { SeatOverageConfig } from "~/domain/member-seat-overage";
import { MemberSeatEpisodeRepo } from "~/models/member-seat-episodes.server";
import { MemberRepo } from "~/models/members.server";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { fakeHandoffNotifier } from "~/test/fake-notifier";
import { fakeRuntime, sequentialIds } from "~/test/fake-runtime";
import { fakeSeats, seatsFor } from "~/test/fake-seats";
import { approveMember, removeMember, restoreMember, type Actor } from "./manage-members";
import type { MemberIdentity } from "./identity";
import { resolveMember, type MemberLogEntry } from "./resolve-member";
import { reviewSeatOverage, type SeatOverageDependencies } from "./review-seat-overage";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const SHOP = "alpha.myshopify.com";
const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;
const TRIM: SeatOverageConfig = { policy: "notify_then_trim", noticeHours: 24 };
const POLICY: AdmissionConfig = { onUnknownUser: "auto_join", autoJoinRole: "member" };
const owner: Actor = { id: "owner", shop: SHOP, role: "owner" };
const identity = (overrides: Partial<MemberIdentity> = {}): MemberIdentity => ({ shop: SHOP, shopifyUserId: "u-m1", email: null, name: null, accountOwner: false, collaborator: false, ...overrides });

/** The members use cases and the review, over the real store, with the plan's seats set by the test. */
function setup(limit: SeatLimit) {
  const seats = fakeSeats(limit);
  const members = new MemberRepo();
  const logs: MemberLogEntry[] = [];
  const access = { members, seats, config: POLICY, runtime: fakeRuntime({ idPrefix: "new" }), log: (entry: MemberLogEntry) => void logs.push(entry) };
  const manage = { members, seats, customPermissions: customPolicy({ enabled: false, alsoProtected: [] }), runtime: access.runtime, log: access.log };
  const notifier = fakeHandoffNotifier();
  const review: SeatOverageDependencies = {
    members,
    episodes: new MemberSeatEpisodeRepo(),
    seats,
    shops: { facts: async () => ({ installed: true, name: "Alpha", contactEmail: null, timeZone: null }) },
    notifier,
    config: TRIM,
    runtime: { ids: sequentialIds("ep") },
    urls: { team: "https://app.example.test/app/members", plan: "https://app.example.test/app/billing" },
    log: () => undefined,
  };
  return { access, manage, review, notifier };
}

async function seedTeam() {
  await db.insert(shops).values({ shop: SHOP, installedAt: 1, relationshipStatus: "INSTALLED" });
  await db.insert(shopMembers).values([
    { id: "owner", shop: SHOP, shopifyUserId: "u-owner", email: "owner@alpha.example", name: "Olu", role: "owner", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 5 },
    { id: "m1", shop: SHOP, shopifyUserId: "u-m1", email: "m1@alpha.example", name: "M1", role: "member", status: "active", createdAt: 2, updatedAt: 1, lastSeenAt: 1 },
    { id: "m2", shop: SHOP, shopifyUserId: "u-m2", email: "m2@alpha.example", name: "M2", role: "member", status: "active", createdAt: 3, updatedAt: 1, lastSeenAt: 2 },
  ]);
}

/** Runs a review at `NOW` (the notice) and at the deadline (the trim) for a team of three on a plan of two seats. */
async function trimOneMember(review: SeatOverageDependencies) {
  await reviewSeatOverage(SHOP, NOW, review);
  await reviewSeatOverage(SHOP, NOW + 24 * HOUR, review);
}

describe("a person a trim took the seat from", () => {
  it("is told the plan is why when they open the app, not that they wait for approval, and is not let back in by opening it", async () => {
    const { access, review } = setup(seatsFor(2));
    const outcomes = await inRequest(async () => {
      await seedTeam();
      await trimOneMember(review);
      const trimmed = (await db.select().from(shopMembers)).find((row) => row.status === "pending");
      if (!trimmed) throw new Error("nobody was trimmed");
      const opened = await resolveMember(identity({ shopifyUserId: trimmed.shopifyUserId ?? "" }), access);
      const again = await resolveMember(identity({ shopifyUserId: trimmed.shopifyUserId ?? "" }), access);
      return { trimmed: trimmed.id, opened, again };
    });
    expect(outcomes.opened).toEqual({ ok: false, reason: "seat_limit" });
    expect(outcomes.again).toEqual({ ok: false, reason: "seat_limit" });
  });

  it("is still told they are waiting when nobody trimmed them: a stranger recorded as pending is not a seat problem", async () => {
    const { access } = setup(seatsFor(1));
    const access1 = await inRequest(async () => {
      await seedTeam();
      return resolveMember(identity({ shopifyUserId: "stranger", email: null }), access);
    });
    expect(access1).toEqual({ ok: false, reason: "pending" });
  });

  it("is let back in by approving them only while a seat is free, as the role chosen, and the mark is cleared", async () => {
    const { manage, review } = setup(seatsFor(2));
    const outcome = await inRequest(async () => {
      await seedTeam();
      await trimOneMember(review);
      const trimmed = (await db.select().from(shopMembers)).find((row) => row.status === "pending");
      if (!trimmed) throw new Error("nobody was trimmed");
      const full = await approveMember({ actor: owner, targetId: trimmed.id, role: "member" }, manage);
      // Someone leaves: a seat is free.
      await removeMember({ actor: owner, targetId: "m2" === trimmed.id ? "m1" : "m2" }, manage);
      const freed = await approveMember({ actor: owner, targetId: trimmed.id, role: "viewer" }, manage);
      return { full, freed, row: (await db.select().from(shopMembers)).find((row) => row.id === trimmed.id) };
    });
    expect(outcome.full).toEqual({ ok: false, reason: "noSeat" });
    expect(outcome.freed).toMatchObject({ ok: true, value: { status: "active", role: "viewer", trimmedAt: null } });
    expect(outcome.row).toMatchObject({ status: "active", trimmedAt: null });
  });

  it("comes back as an ordinary restored member, with no seat mark, after being removed and restored", async () => {
    const { manage, review, access } = setup(seatsFor(5));
    const outcome = await inRequest(async () => {
      await seedTeam();
      // Seats are plenty again after the trim: only the removal and restore are under test.
      await trimOneMember({ ...review, seats: fakeSeats(seatsFor(2)) });
      const trimmed = (await db.select().from(shopMembers)).find((row) => row.status === "pending");
      if (!trimmed) throw new Error("nobody was trimmed");
      await removeMember({ actor: owner, targetId: trimmed.id }, manage);
      const removed = await resolveMember(identity({ shopifyUserId: trimmed.shopifyUserId ?? "" }), access);
      await restoreMember({ actor: owner, targetId: trimmed.id, role: "member" }, manage);
      return { removed, row: (await db.select().from(shopMembers)).find((row) => row.id === trimmed.id) };
    });
    expect(outcome.removed).toEqual({ ok: false, reason: "removed" });
    expect(outcome.row).toMatchObject({ status: "active", trimmedAt: null });
  });
});

describe("an owner who arrives at a full shop", () => {
  it("is admitted past the limit, counts as a seat, and is never the one a trim takes", async () => {
    const { access, review, notifier } = setup(seatsFor(2));
    const outcome = await inRequest(async () => {
      await db.insert(shops).values({ shop: SHOP, installedAt: 1, relationshipStatus: "INSTALLED" });
      await db.insert(shopMembers).values([
        { id: "a1", shop: SHOP, shopifyUserId: "u-a1", email: "a1@alpha.example", name: "A1", role: "admin", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 9 },
        { id: "m1", shop: SHOP, shopifyUserId: "u-m1", email: "m1@alpha.example", name: "M1", role: "member", status: "active", createdAt: 2, updatedAt: 1, lastSeenAt: 1 },
      ]);
      // The team already fills both seats. Shopify's account owner opens the app.
      const arrived = await resolveMember(identity({ shopifyUserId: "u-store", accountOwner: true, email: "store@alpha.example", name: "Store" }), access);
      await trimOneMember(review);
      return { arrived, rows: await db.select().from(shopMembers) };
    });
    expect(outcome.arrived).toMatchObject({ ok: true, member: { role: "owner", status: "active" } });
    const byId = new Map(outcome.rows.map((row) => [row.id, row]));
    // Three active against two seats: one goes, and it is the member (not the owner, not the admin who holds the team).
    expect(byId.get("m1")).toMatchObject({ status: "pending", trimmedAt: expect.any(Number) });
    expect(byId.get("a1")?.status).toBe("active");
    expect([...byId.values()].find((row) => row.accountOwner)?.status).toBe("active");
    // The owner is who was told.
    expect(notifier.forEvent("members_seat_trim_notice").map((request) => request.to.email)).toEqual(["store@alpha.example"]);
  });
});
