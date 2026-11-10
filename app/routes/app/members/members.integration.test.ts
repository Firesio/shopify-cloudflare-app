import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { shopMembers, shops } from "~/db/schema";
import type { AdmissionConfig } from "~/domain/member-admission";
import { customPolicy, type CustomPermissionPolicy } from "~/domain/member-permissions";
import type { SeatLimit, SeatReading } from "~/domain/member-seats";
import { can, grantsOf } from "~/domain/member-access";
import { MemberRepo } from "~/models/members.server";
import { runWithRequestContext } from "~/request-context.server";
import { resolveMember, type MemberDependencies } from "~/services/members.server";
import { setupTestDatabase } from "~/test/db";
import { fakeSeats, seatsFor } from "~/test/fake-seats";
import { fakeRuntime } from "~/test/fake-runtime";
import { loadMember, loadTeam, runIntent, type TeamDependencies } from "./members.server";

/**
 * The members page's server half against real D1: what it loads and what each form does, through the real store and the
 * real use cases, with only the plan's seat limit set by the test.
 */
setupTestDatabase();
const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const A = "alpha.myshopify.com";
const B = "beta.myshopify.com";

const customAllowed = customPolicy({ enabled: true, alsoProtected: [] });

function deps(
  limit: SeatLimit = { kind: "unlimited" },
  config: AdmissionConfig = { onUnknownUser: "auto_join", autoJoinRole: "member" },
  customPermissions: CustomPermissionPolicy = customAllowed,
  reading: SeatReading = limit,
): MemberDependencies & TeamDependencies {
  return { members: new MemberRepo(), seats: fakeSeats(limit, reading), config, customPermissions, runtime: fakeRuntime({ idPrefix: "m" }), log: () => undefined };
}

const identity = (shopifyUserId: string, overrides: { email?: string | null; accountOwner?: boolean; shop?: string; name?: string | null } = {}) => ({
  shop: overrides.shop ?? A,
  shopifyUserId,
  email: overrides.email ?? null,
  name: overrides.name ?? null,
  accountOwner: overrides.accountOwner ?? false,
  collaborator: false,
});

/** A form; a field given as a list is sent once per value, the way a group of checkboxes is. */
const form = (fields: Record<string, string | readonly string[]>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") data.set(key, value);
    else for (const each of value) data.append(key, each);
  }
  return data;
};

async function seed() {
  await db.insert(shops).values([{ shop: A, installedAt: 1 }, { shop: B, installedAt: 1 }]);
}

/** Opens the app as `userId` on shop A and returns who they became. */
async function open(d: MemberDependencies, userId: string, overrides: Parameters<typeof identity>[1] = {}) {
  const access = await resolveMember(identity(userId, overrides), d);
  return access.ok ? access.member : undefined;
}

/** Opens the app as `userId` and returns their stored membership, whether they got in or are waiting. */
async function known(d: MemberDependencies, userId: string, overrides: Parameters<typeof identity>[1] = {}) {
  await resolveMember(identity(userId, overrides), d);
  return new MemberRepo().findByUserId(A, userId);
}

describe("the team page, end to end", () => {
  it("shows the first person as the admin, then everyone who opens the app as a member", async () => {
    const page = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = await open(d, "1", { name: "Olu" });
      await open(d, "2", { name: "Mia" });
      await open(d, "3", { name: "Lee" });
      return loadTeam(owner!, d);
    });
    expect(page.rows.map((row) => [row.name, row.role, row.status])).toEqual([
      ["Olu", "admin", "active"],
      ["Lee", "member", "active"],
      ["Mia", "member", "active"],
    ]);
    expect(page.seats).toEqual({ kind: "unlimited" });
    expect(page.waiting).toBe(0);
    // The first person is an admin, who may hand out every role but owner.
    expect(page.roles).toEqual(["admin", "member", "viewer"]);
  });

  it("carries nothing of another shop's team, and no Shopify user id", async () => {
    const page = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = await open(d, "1", { name: "Olu" });
      await resolveMember(identity("9", { shop: B, name: "Other" }), d);
      return loadTeam(owner!, d);
    });
    expect(page.rows.map((row) => row.name)).toEqual(["Olu"]);
    expect(JSON.stringify(page)).not.toContain('"shopifyUserId"');
  });

  it("holds a stranger as waiting when the plan is full, and lets them in once a seat is freed", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps(seatsFor(2));
      const owner = (await open(d, "1", { name: "Olu" }))!;
      const second = (await open(d, "2", { name: "Mia" }))!;
      await open(d, "3", { name: "Lee" });
      const full = await loadTeam(owner, d);
      const refused = await runIntent(form({ intent: "approve", id: full.rows[0]!.id, role: "member" }), { actor: owner, deps: d });
      await runIntent(form({ intent: "remove", id: second.id }), { actor: owner, deps: d });
      const freed = await loadTeam(owner, d);
      const waiting = freed.rows.find((row) => row.status === "pending")!;
      const approved = await runIntent(form({ intent: "approve", id: waiting.id, role: "viewer" }), { actor: owner, deps: d });
      return { full: { seats: full.seats, waiting: full.waiting, first: full.rows[0]!.name }, refused, freedSeats: freed.seats, approved, after: await loadTeam(owner, d) };
    });
    expect(outcome.full).toEqual({ seats: { kind: "limit", maximum: 2, used: 2, left: 0, over: 0 }, waiting: 1, first: "Lee" });
    expect(outcome.refused).toEqual({ error: "noSeat" });
    expect(outcome.freedSeats).toMatchObject({ used: 1, left: 1 });
    expect(outcome.approved).toEqual({ success: "approved" });
    expect(outcome.after.waiting).toBe(0);
    expect(outcome.after.rows.find((row) => row.name === "Lee")).toMatchObject({ status: "active", role: "viewer" });
  });

  it("reports a team past its limit after a downgrade, and removes nobody", async () => {
    const page = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1"))!;
      await open(d, "2");
      await open(d, "3");
      return loadTeam(owner, deps(seatsFor(1)));
    });
    expect(page.seats).toEqual({ kind: "limit", maximum: 1, used: 3, left: 0, over: 2 });
    expect(page.rows.filter((row) => row.status === "active")).toHaveLength(3);
  });

  it("invites by email and takes the invitation up the first time that verified address opens the app", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps(undefined, { onUnknownUser: "invite_only", autoJoinRole: "member" });
      const owner = (await open(d, "1", { name: "Olu" }))!;
      const stranger = await resolveMember(identity("2", { email: "new@firesio.app" }), d);
      const invited = await runIntent(form({ intent: "invite", email: " New@Firesio.app ", role: "admin" }), { actor: owner, deps: d });
      const duplicate = await runIntent(form({ intent: "invite", email: "new@firesio.app", role: "admin" }), { actor: owner, deps: d });
      const joined = await resolveMember(identity("2", { email: "new@firesio.app", name: "Newt" }), d);
      return { stranger, invited, duplicate, joined, page: await loadTeam(owner, d) };
    });
    expect(outcome.stranger).toEqual({ ok: false, reason: "not_invited" });
    expect(outcome.invited).toEqual({ success: "invited" });
    expect(outcome.duplicate).toEqual({ error: "alreadyMember" });
    expect(outcome.joined).toMatchObject({ ok: true, member: { role: "admin", status: "active" } });
    expect(outcome.page.rows.map((row) => [row.name, row.role, row.isInvitation])).toEqual([["Newt", "admin", false], ["Olu", "admin", false]]);
  });

  it("cancels an invitation nobody took up, and says it was cancelled", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1"))!;
      await runIntent(form({ intent: "invite", email: "x@firesio.app", role: "viewer" }), { actor: owner, deps: d });
      const row = (await loadTeam(owner, d)).rows.find((entry) => entry.isInvitation)!;
      return { cancelled: await runIntent(form({ intent: "remove", id: row.id }), { actor: owner, deps: d }), after: (await loadTeam(owner, d)).rows.find((entry) => entry.id === row.id)?.status };
    });
    // Deleted: no row stays behind to be restored, counted or shown.
    expect(outcome).toEqual({ cancelled: { success: "invitationCancelled" }, after: undefined });
  });

  it("cancels an invitation for good: it holds no seat, cannot be brought back, and the address can be invited again", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps(seatsFor(5));
      const owner = (await open(d, "1"))!;
      await runIntent(form({ intent: "invite", email: "x@firesio.app", role: "viewer" }), { actor: owner, deps: d });
      const id = (await loadTeam(owner, d)).rows.find((entry) => entry.isInvitation)!.id;
      await runIntent(form({ intent: "remove", id }), { actor: owner, deps: d });
      const restored = await runIntent(form({ intent: "restore", id, role: "viewer" }), { actor: owner, deps: d });
      const approved = await runIntent(form({ intent: "approve", id, role: "viewer" }), { actor: owner, deps: d });
      const again = await runIntent(form({ intent: "invite", email: "x@firesio.app", role: "viewer" }), { actor: owner, deps: d });
      const page = await loadTeam(owner, d);
      return { restored, approved, again, seats: page.seats, rows: page.rows.map((entry) => [entry.status, entry.isInvitation]) };
    });
    expect(outcome.restored).toEqual({ error: "notFound" });
    expect(outcome.approved).toEqual({ error: "notFound" });
    expect(outcome.again).toEqual({ success: "invited" });
    expect(outcome.seats).toMatchObject({ used: 1, left: 4 });
    expect(outcome.rows).toEqual([["active", false], ["invited", true]]);
  });

  it("cannot cancel another shop's invitation through its id", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1"))!;
      const foreign = await new MemberRepo().createInvite(B, { id: "b-inv", email: "b@firesio.app", role: "viewer", invitedBy: "someone", now: 1 });
      const result = await runIntent(form({ intent: "remove", id: foreign.id }), { actor: owner, deps: d });
      return { result, kept: (await new MemberRepo().findById(B, "b-inv"))?.status };
    });
    expect(outcome).toEqual({ result: { error: "notFound" }, kept: "invited" });
  });

  it("changes a role, restores a removed member, and protects the last owner", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1", { name: "Olu", accountOwner: true }))!;
      const mia = (await open(d, "2", { name: "Mia" }))!;
      const changed = await runIntent(form({ intent: "changeRole", id: mia.id, role: "admin" }), { actor: owner, deps: d });
      const removed = await runIntent(form({ intent: "remove", id: mia.id }), { actor: owner, deps: d });
      const restored = await runIntent(form({ intent: "restore", id: mia.id, role: "viewer" }), { actor: owner, deps: d });
      // Mia (now a viewer) cannot do any of it.
      const viaViewer = await runIntent(form({ intent: "remove", id: owner.id }), { actor: { ...mia, role: "viewer" }, deps: d });
      const second = (await open(d, "3", { name: "Lee" }))!;
      const lone = await runIntent(form({ intent: "changeRole", id: owner.id, role: "member" }), { actor: { ...second, role: "owner" }, deps: d });
      return { changed, removed, restored, viaViewer, lone, mia: (await loadTeam(owner, d)).rows.find((row) => row.id === mia.id) };
    });
    expect(outcome.changed).toEqual({ success: "roleChanged" });
    expect(outcome.removed).toEqual({ success: "removed" });
    expect(outcome.restored).toEqual({ success: "restored" });
    expect(outcome.viaViewer).toEqual({ error: "forbidden" });
    expect(outcome.lone).toEqual({ error: "lastOwner" });
    expect(outcome.mia).toMatchObject({ status: "active", role: "viewer" });
  });

  it("lets an admin run the team but not touch the owner", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1", { name: "Olu", accountOwner: true }))!;
      const mia = (await open(d, "2", { name: "Mia" }))!;
      const lee = (await open(d, "3", { name: "Lee" }))!;
      await runIntent(form({ intent: "changeRole", id: mia.id, role: "admin" }), { actor: owner, deps: d });
      const admin = { ...mia, role: "admin" as const };
      return {
        demoteOwner: await runIntent(form({ intent: "changeRole", id: owner.id, role: "member" }), { actor: admin, deps: d }),
        removeOwner: await runIntent(form({ intent: "remove", id: owner.id }), { actor: admin, deps: d }),
        makeOwner: await runIntent(form({ intent: "changeRole", id: lee.id, role: "owner" }), { actor: admin, deps: d }),
        manage: await runIntent(form({ intent: "changeRole", id: lee.id, role: "admin" }), { actor: admin, deps: d }),
        owner: (await loadTeam(owner, d)).rows.find((row) => row.id === owner.id)?.role,
      };
    });
    expect(outcome).toEqual({
      demoteOwner: { error: "forbidden" },
      removeOwner: { error: "forbidden" },
      makeOwner: { error: "forbidden" },
      manage: { success: "roleChanged" },
      owner: "owner",
    });
  });

  it("keeps someone who can manage the team in a shop with no owner, even when two admins remove each other at once", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps();
      const olu = (await open(d, "1", { name: "Olu" }))!;
      const mia = (await open(d, "2", { name: "Mia" }))!;
      const lee = (await open(d, "3", { name: "Lee" }))!;
      await runIntent(form({ intent: "changeRole", id: mia.id, role: "admin" }), { actor: olu, deps: d });
      await runIntent(form({ intent: "changeRole", id: lee.id, role: "admin" }), { actor: olu, deps: d });
      const removedFirst = await runIntent(form({ intent: "remove", id: olu.id }), { actor: { ...mia, role: "admin" }, deps: d });
      const both = await Promise.all([
        runIntent(form({ intent: "remove", id: mia.id }), { actor: { ...lee, role: "admin" }, deps: d }),
        runIntent(form({ intent: "remove", id: lee.id }), { actor: { ...mia, role: "admin" }, deps: d }),
      ]);
      const active = (await loadTeam(olu, d)).rows.filter((row) => row.status === "active");
      return { removedFirst, landed: both.filter((result) => "success" in result).length, refused: both.find((result) => "error" in result), active: active.map((row) => row.role) };
    });
    expect(outcome).toEqual({ removedFirst: { success: "removed" }, landed: 1, refused: { error: "lastManager" }, active: ["admin"] });
  });

  it("answers a bad form with an error, never a crash", async () => {
    const results = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1"))!;
      const run = (fields: Record<string, string>) => runIntent(form(fields), { actor: owner, deps: d });
      return {
        unknown: await run({ intent: "launch" }),
        none: await run({}),
        badRole: await run({ intent: "invite", email: "a@firesio.app", role: "god" }),
        noRole: await run({ intent: "changeRole", id: owner.id }),
        badEmail: await run({ intent: "invite", email: "nobody", role: "viewer" }),
        ghost: await run({ intent: "remove", id: "no-such-member" }),
        self: await run({ intent: "remove", id: owner.id }),
      };
    });
    expect(results).toEqual({
      unknown: { error: "unknownIntent" },
      none: { error: "unknownIntent" },
      badRole: { error: "roleInvalid" },
      noRole: { error: "roleInvalid" },
      badEmail: { error: "emailInvalid" },
      ghost: { error: "notFound" },
      self: { error: "notYourself" },
    });
  });

  it("cannot reach another shop's member through an id from a form", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1"))!;
      const other = await resolveMember(identity("9", { shop: B }), d);
      const foreignId = other.ok ? other.member.id : "";
      return { result: await runIntent(form({ intent: "remove", id: foreignId }), { actor: owner, deps: d }), still: (await new MemberRepo().findById(B, foreignId))?.status };
    });
    expect(outcome).toEqual({ result: { error: "notFound" }, still: "active" });
  });
});

describe("one member's page, end to end", () => {
  it("shows a person with what a list has no room for, who invited an invitation by name, and the roles you may give", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps(undefined, { onUnknownUser: "invite_only", autoJoinRole: "member" });
      const owner = (await open(d, "1", { name: "Olu", email: "olu@firesio.app" }))!;
      await runIntent(form({ intent: "invite", email: "new@firesio.app", role: "viewer" }), { actor: owner, deps: d });
      const invitation = (await loadTeam(owner, d)).rows.find((row) => row.isInvitation)!;
      return { invitation: await loadMember(owner, invitation.id, d), self: await loadMember(owner, owner.id, d) };
    });
    expect(outcome.invitation?.member).toMatchObject({ email: "new@firesio.app", role: "viewer", status: "invited", isInvitation: true, collaborator: false, invitedBy: { name: "Olu", email: "olu@firesio.app" } });
    expect(outcome.invitation?.member.can).toMatchObject({ remove: true, changeRole: true });
    expect(outcome.invitation?.roles).toEqual(["admin", "member", "viewer"]);
    expect(outcome.self?.member).toMatchObject({ isYou: true, invitedBy: null, can: { changeRole: false, remove: false, approve: false, restore: false } });
  });

  it("finds nobody for an id that is not on this shop's team, and never another shop's member or a Shopify user id", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1"))!;
      const other = await resolveMember(identity("9", { shop: B, name: "Other" }), d);
      const foreignId = other.ok ? other.member.id : "";
      const mine = await loadMember(owner, owner.id, d);
      return { foreign: await loadMember(owner, foreignId, d), ghost: await loadMember(owner, "no-such-member", d), json: JSON.stringify(mine) };
    });
    expect(outcome.foreign).toBeUndefined();
    expect(outcome.ghost).toBeUndefined();
    expect(outcome.json).not.toContain('"shopifyUserId"');
    expect(outcome.json).not.toContain('"invitedBy":"');
  });

  it("does what the page's forms ask of one person and shows the new state when it is loaded again", async () => {
    const after = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1"))!;
      const mia = (await open(d, "2", { name: "Mia" }))!;
      const changed = await runIntent(form({ intent: "changeRole", id: mia.id, role: "viewer" }), { actor: owner, deps: d });
      const removed = await runIntent(form({ intent: "remove", id: mia.id }), { actor: owner, deps: d });
      const gone = await loadMember(owner, mia.id, d);
      const restored = await runIntent(form({ intent: "restore", id: mia.id, role: "member" }), { actor: owner, deps: d });
      return { changed, removed, goneStatus: gone?.member.status, goneCan: gone?.member.can, restored, back: (await loadMember(owner, mia.id, d))?.member };
    });
    expect(after.changed).toEqual({ success: "roleChanged" });
    expect(after.removed).toEqual({ success: "removed" });
    expect(after.goneStatus).toBe("removed");
    expect(after.goneCan).toMatchObject({ restore: true, remove: false, changeRole: false });
    expect(after.restored).toEqual({ success: "restored" });
    expect(after.back).toMatchObject({ status: "active", role: "member" });
  });
});

describe("the team page tells waiting, no seat and unreadable apart", () => {
  const pendingRow = (id: string, userId: string, overrides: Partial<typeof shopMembers.$inferInsert> = {}): typeof shopMembers.$inferInsert => ({
    id,
    shop: A,
    shopifyUserId: userId,
    role: "viewer",
    status: "pending",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  it("counts people waiting for approval apart from people who lost a seat, and only in this shop", async () => {
    const page = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1"))!;
      await db.insert(shopMembers).values([
        pendingRow("w1", "20"),
        pendingRow("t1", "21", { trimmedAt: 5 }),
        pendingRow("t2", "22", { trimmedAt: 6 }),
        pendingRow("bt", "23", { shop: B, trimmedAt: 6 }),
      ]);
      return loadTeam(owner, d);
    });
    expect(page).toMatchObject({ waiting: 1, noSeat: 2 });
    expect(page.rows.filter((row) => row.noSeat).map((row) => row.id).sort()).toEqual(["t1", "t2"]);
  });

  it("says when the list was cut at its cap and how many people it left out, and nothing when it is whole", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1"))!;
      const whole = await loadTeam(owner, d);
      // Small batches: D1 refuses a statement with more than 100 bound variables.
      for (let start = 0; start < 502; start += 5) {
        await db.insert(shopMembers).values(Array.from({ length: Math.min(5, 502 - start) }, (_, offset) => pendingRow(`bulk-${start + offset}`, `u-${start + offset}`)));
      }
      const capped = await loadTeam(owner, d);
      return { whole: whole.hidden, shown: capped.rows.length, hidden: capped.hidden, waiting: capped.waiting };
    });
    expect(outcome).toEqual({ whole: 0, shown: 500, hidden: 3, waiting: 502 });
  });

  it("shows an unreadable plan as unknown with the people in use, while admission still gives no new seat", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps(seatsFor(0), undefined, undefined, { kind: "unknown" });
      const owner = (await open(d, "1"))!;
      const page = await loadTeam(owner, d);
      const stranger = await known(d, "2");
      return { seats: page.seats, stranger: stranger?.status };
    });
    expect(outcome).toEqual({ seats: { kind: "unknown", used: 1 }, stranger: "pending" });
  });
});

describe("one member's page knows whether the plan has a seat for them", () => {
  /** Alpha's owner, plus a waiting person, a removed person and an active one. */
  async function team(d: ReturnType<typeof deps>) {
    await seed();
    const owner = (await open(d, "1"))!;
    const active = (await known(d, "2", { name: "Act" }))!;
    const waiting = (await known(d, "3", { name: "Wait" }))!;
    const gone = (await known(d, "4", { name: "Gone" }))!;
    await runIntent(form({ intent: "remove", id: gone.id }), { actor: owner, deps: d });
    return { owner, active, waiting, gone };
  }

  it("is full for a waiting person once every seat is in use, and the server agrees", async () => {
    const outcome = await inRequest(async () => {
      const d = deps(seatsFor(2));
      const { owner, waiting, gone } = await team(d);
      const w = await loadMember(owner, waiting.id, d);
      const g = await loadMember(owner, gone.id, d);
      const refused = await runIntent(form({ intent: "approve", id: waiting.id, role: "viewer" }), { actor: owner, deps: d });
      return { w: w?.member.seat, g: g?.member.seat, refused };
    });
    expect(outcome).toEqual({ w: { open: false, why: "full" }, g: { open: false, why: "full" }, refused: { error: "noSeat" } });
  });

  it("is open when a seat is free, and the server then lets them in", async () => {
    const outcome = await inRequest(async () => {
      const d = deps(seatsFor(2));
      const { owner, active, waiting } = await team(d);
      await runIntent(form({ intent: "remove", id: active.id }), { actor: owner, deps: d });
      const seat = (await loadMember(owner, waiting.id, d))?.member.seat;
      return { seat, approved: await runIntent(form({ intent: "approve", id: waiting.id, role: "viewer" }), { actor: owner, deps: d }) };
    });
    expect(outcome).toEqual({ seat: { open: true }, approved: { success: "approved" } });
  });

  it("is unreadable when the plan could not be read, and the server refuses too", async () => {
    const outcome = await inRequest(async () => {
      const d = deps(seatsFor(0), undefined, undefined, { kind: "unknown" });
      const { owner, waiting } = await team(d);
      const seat = (await loadMember(owner, waiting.id, d))?.member.seat;
      return { seat, refused: await runIntent(form({ intent: "approve", id: waiting.id, role: "viewer" }), { actor: owner, deps: d }) };
    });
    expect(outcome).toEqual({ seat: { open: false, why: "unreadable" }, refused: { error: "noSeat" } });
  });

  it("reads the plan only for someone it decides for: an active member costs no seat read", async () => {
    const outcome = await inRequest(async () => {
      const seats = fakeSeats(seatsFor(2));
      const d = { ...deps(seatsFor(2)), seats };
      const { owner, active, waiting } = await team(d);
      const before = seats.readings;
      const activeRead = await loadMember(owner, active.id, d);
      const afterActive = seats.readings;
      await loadMember(owner, waiting.id, d);
      return { activeSeat: activeRead?.member.seat, activeReads: afterActive - before, waitingReads: seats.readings - afterActive };
    });
    expect(outcome).toEqual({ activeSeat: null, activeReads: 0, waitingReads: 1 });
  });

  it("offers a way to the plan only to someone who may change it", async () => {
    const outcome = await inRequest(async () => {
      const d = deps();
      const { owner, active } = await team(d);
      return { owner: (await loadMember(owner, active.id, d))?.canChangePlan, member: (await loadMember({ ...owner, role: "member" }, active.id, d))?.canChangePlan };
    });
    expect(outcome).toEqual({ owner: true, member: false });
  });

  it("finds nothing for a cancelled invitation of the old kind, and for another shop's member", async () => {
    const outcome = await inRequest(async () => {
      const d = deps();
      const { owner } = await team(d);
      await db.insert(shopMembers).values([
        { id: "old", shop: A, role: "viewer", status: "removed", createdAt: 1, updatedAt: 1 },
        { id: "b-old", shop: B, role: "viewer", status: "removed", createdAt: 1, updatedAt: 1 },
      ]);
      return { old: await loadMember(owner, "old", d), foreign: await loadMember(owner, "b-old", d), list: (await loadTeam(owner, d)).rows.map((row) => row.id) };
    });
    expect(outcome.old).toBeUndefined();
    expect(outcome.foreign).toBeUndefined();
    expect(outcome.list).not.toContain("old");
  });
});

describe("giving a member a set of permissions, end to end", () => {
  /** An owner, and Mia as a member, on shop A; the owner is who acts. */
  async function setup(policy: CustomPermissionPolicy = customAllowed) {
    await seed();
    const d = deps(undefined, undefined, policy);
    const owner = (await open(d, "1", { name: "Olu" }))!;
    const mia = (await open(d, "2", { name: "Mia" }))!;
    return { d, owner, mia };
  }

  it("saves the set from the form's checkboxes, and the person's page and the list then show it", async () => {
    const outcome = await inRequest(async () => {
      const { d, owner, mia } = await setup();
      const saved = await runIntent(form({ intent: "setPermissions", id: mia.id, permissions: ["app:manage", "app:view", "billing:manage"] }), { actor: owner, deps: d });
      const page = await loadMember(owner, mia.id, d);
      const rows = (await loadTeam(owner, d)).rows;
      return { saved, page, row: rows.find((row) => row.id === mia.id) };
    });
    expect(outcome.saved).toEqual({ success: "permissionsChanged" });
    expect(outcome.page?.member).toMatchObject({ custom: true, role: "member", permissions: ["app:view", "app:manage", "billing:manage"] });
    expect(outcome.row).toMatchObject({ custom: true, role: "member" });
    expect(JSON.stringify(outcome.row)).not.toContain("billing:manage");
  });

  it("saves the role the set is based on with it, from the form's role field", async () => {
    const page = await inRequest(async () => {
      const { d, owner, mia } = await setup();
      const saved = await runIntent(form({ intent: "setPermissions", id: mia.id, role: "viewer", permissions: ["app:view", "app:manage"] }), { actor: owner, deps: d });
      return { saved, page: await loadMember(owner, mia.id, d) };
    });
    expect(page.saved).toEqual({ success: "permissionsChanged" });
    expect(page.page?.member).toMatchObject({ custom: true, role: "viewer", permissions: ["app:view", "app:manage"] });
  });

  it("refuses a role that is not one of ours, and stores nothing", async () => {
    const outcome = await inRequest(async () => {
      const { d, owner, mia } = await setup();
      const result = await runIntent(form({ intent: "setPermissions", id: mia.id, role: "god", permissions: ["app:view"] }), { actor: owner, deps: d });
      return { result, custom: (await loadMember(owner, mia.id, d))?.member.custom };
    });
    expect(outcome).toEqual({ result: { error: "roleInvalid" }, custom: false });
  });

  it("is judged by the set from then on: the person can use what it holds and nothing their role would have given", async () => {
    const outcome = await inRequest(async () => {
      const { d, owner, mia } = await setup();
      await runIntent(form({ intent: "setPermissions", id: mia.id, permissions: ["app:view"] }), { actor: owner, deps: d });
      const found = await new MemberRepo().findById(A, mia.id);
      return { can: found && grantsOf(found), manage: found && can(found, "app:manage") };
    });
    expect(outcome).toEqual({ can: ["app:view"], manage: false });
  });

  it("is replaced by a role chosen afterwards, and the page shows a preset again", async () => {
    const page = await inRequest(async () => {
      const { d, owner, mia } = await setup();
      await runIntent(form({ intent: "setPermissions", id: mia.id, permissions: ["app:view"] }), { actor: owner, deps: d });
      await runIntent(form({ intent: "changeRole", id: mia.id, role: "member" }), { actor: owner, deps: d });
      return loadMember(owner, mia.id, d);
    });
    expect(page?.member).toMatchObject({ custom: false, role: "member", permissions: ["app:view", "app:manage"] });
  });

  it("refuses what the form should never carry, with a reason, and stores nothing", async () => {
    const outcome = await inRequest(async () => {
      const { d, owner, mia } = await setup();
      const run = (permissions: readonly string[]) => runIntent(form({ intent: "setPermissions", id: mia.id, permissions }), { actor: owner, deps: d });
      return {
        unknownName: await run(["app:view", "root"]),
        noWayIn: await run(["app:manage"]),
        none: await run([]),
        team: await run(["app:view", "members:manage"]),
        stored: (await loadMember(owner, mia.id, d))?.member.custom,
      };
    });
    expect(outcome).toEqual({ unknownName: { error: "permissionInvalid" }, noWayIn: { error: "permissionInvalid" }, none: { error: "permissionInvalid" }, team: { error: "cannotGrant" }, stored: false });
  });

  it("treats a file in the form as a name that is not a permission", async () => {
    const result = await inRequest(async () => {
      const { d, owner, mia } = await setup();
      const data = form({ intent: "setPermissions", id: mia.id, permissions: ["app:view"] });
      data.append("permissions", new File(["x"], "x.txt"));
      return runIntent(data, { actor: owner, deps: d });
    });
    expect(result).toEqual({ error: "permissionInvalid" });
  });

  it("is unavailable when the app does not let merchants do it, and nothing is stored", async () => {
    const outcome = await inRequest(async () => {
      const { d, owner, mia } = await setup(customPolicy({ enabled: false, alsoProtected: [] }));
      const result = await runIntent(form({ intent: "setPermissions", id: mia.id, permissions: ["app:view"] }), { actor: owner, deps: d });
      return { result, custom: (await loadMember(owner, mia.id, d))?.member.custom, allowed: (await loadMember(owner, mia.id, d))?.member.customize.allowed };
    });
    expect(outcome).toEqual({ result: { error: "customUnavailable" }, custom: false, allowed: false });
  });

  it("cannot reach another shop's member through an id from a form", async () => {
    const outcome = await inRequest(async () => {
      const { d, owner } = await setup();
      const other = await resolveMember(identity("9", { shop: B }), d);
      const foreignId = other.ok ? other.member.id : "";
      return { result: await runIntent(form({ intent: "setPermissions", id: foreignId, permissions: ["app:view"] }), { actor: owner, deps: d }), still: (await new MemberRepo().findById(B, foreignId))?.permissions };
    });
    expect(outcome).toEqual({ result: { error: "notFound" }, still: null });
  });

  it("says what the page may offer: the permissions the looker may tick, and which the app protects", async () => {
    const page = await inRequest(async () => {
      const { d, owner, mia } = await setup(customPolicy({ enabled: true, alsoProtected: ["billing:manage"] }));
      return loadMember(owner, mia.id, d);
    });
    expect(page?.member.customize).toEqual({ allowed: true, grantable: ["app:view", "app:manage"] });
    expect(page?.policy).toEqual({ enabled: true, protected: ["billing:manage", "members:manage"] });
  });

  it("is a permission the intent asks of the person sending it: someone whose own set lacks members:manage is refused first", async () => {
    const outcome = await inRequest(async () => {
      const { d, owner, mia } = await setup();
      const second = (await open(d, "3", { name: "Cy" }))!;
      await runIntent(form({ intent: "changeRole", id: second.id, role: "admin" }), { actor: owner, deps: d });
      await runIntent(form({ intent: "setPermissions", id: second.id, permissions: ["app:view", "app:manage"] }), { actor: owner, deps: d });
      const limited = (await new MemberRepo().findById(A, second.id))!;
      return runIntent(form({ intent: "setPermissions", id: mia.id, permissions: ["app:view"] }), { actor: limited, deps: d });
    });
    expect(outcome).toEqual({ error: "forbidden" });
  });
});
