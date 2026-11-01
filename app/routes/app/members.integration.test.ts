import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { shops } from "~/db/schema";
import type { AdmissionConfig } from "~/domain/member-admission";
import type { SeatLimit } from "~/domain/member-seats";
import { MemberRepo } from "~/models/members.server";
import { runWithRequestContext } from "~/request-context.server";
import { resolveMember, type MemberDependencies } from "~/services/members.server";
import { setupTestDatabase } from "~/test/db";
import { fakeSeats, seatsFor } from "~/test/fake-seats";
import { fakeRuntime } from "~/test/fake-runtime";
import { loadTeam, runIntent, type TeamDependencies } from "./members.server";

/**
 * The members page's server half against real D1: what it loads and what each form does, through the real store and the
 * real use cases, with only the plan's seat limit set by the test.
 */
setupTestDatabase();
const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const A = "alpha.myshopify.com";
const B = "beta.myshopify.com";

function deps(limit: SeatLimit = { kind: "unlimited" }, config: AdmissionConfig = { onUnknownUser: "auto_join", autoJoinRole: "member" }): MemberDependencies & TeamDependencies {
  return { members: new MemberRepo(), seats: fakeSeats(limit), config, runtime: fakeRuntime({ idPrefix: "m" }), log: () => undefined };
}

const identity = (shopifyUserId: string, overrides: { email?: string | null; accountOwner?: boolean; shop?: string; name?: string | null } = {}) => ({
  shop: overrides.shop ?? A,
  shopifyUserId,
  email: overrides.email ?? null,
  name: overrides.name ?? null,
  accountOwner: overrides.accountOwner ?? false,
  collaborator: false,
});

const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
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

describe("the team page, end to end", () => {
  it("shows the installer as the owner, then everyone who opens the app as a member", async () => {
    const page = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = await open(d, "1", { name: "Olu" });
      await open(d, "2", { name: "Mia" });
      await open(d, "3", { name: "Lee" });
      return loadTeam(owner!, d);
    });
    expect(page.rows.map((row) => [row.name, row.role, row.status])).toEqual([
      ["Olu", "owner", "active"],
      ["Lee", "member", "active"],
      ["Mia", "member", "active"],
    ]);
    expect(page.seats).toEqual({ kind: "unlimited" });
    expect(page.waiting).toBe(0);
    expect(page.roles).toEqual(["owner", "admin", "member", "viewer"]);
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
    expect(outcome.page.rows.map((row) => [row.name, row.role, row.isInvitation])).toEqual([["Olu", "owner", false], ["Newt", "admin", false]]);
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
    expect(outcome).toEqual({ cancelled: { success: "invitationCancelled" }, after: "removed" });
  });

  it("changes a role, restores a removed member, and protects the last owner", async () => {
    const outcome = await inRequest(async () => {
      await seed();
      const d = deps();
      const owner = (await open(d, "1", { name: "Olu" }))!;
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
