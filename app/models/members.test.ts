import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { shopMembers, shops } from "~/db/schema";
import type { MemberRole } from "~/domain/member-access";
import type { MemberProfile } from "~/ports/members";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { MemberRepo } from "./members.server";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const A = "alpha.myshopify.com";
const B = "beta.myshopify.com";
const profile = (overrides: Partial<MemberProfile> = {}): MemberProfile => ({ email: null, name: null, accountOwner: false, collaborator: false, ...overrides });
const person = (id: string, shopifyUserId: string, overrides: Partial<MemberProfile> = {}) => ({ id, shopifyUserId, ...profile(overrides) });

async function seedShops() {
  await db.insert(shops).values([{ shop: A, installedAt: 1 }, { shop: B, installedAt: 1 }]);
}

describe("createFirstMemberIfNone", () => {
  const first = (repo: MemberRepo, shop: string, id: string, userId: string, overrides: Partial<MemberProfile> = {}, role: MemberRole = "admin", now = 1) =>
    repo.createFirstMemberIfNone(shop, { ...person(id, userId, overrides), role, now });

  it("makes the first person an active member with the role given, and records their profile", async () => {
    const created = await inRequest(async () => {
      await seedShops();
      return first(new MemberRepo(), A, "m1", "42", { email: "Ada@Firesio.app", name: "Ada", accountOwner: true }, "admin", 100);
    });
    expect(created).toMatchObject({ id: "m1", shop: A, shopifyUserId: "42", email: "ada@firesio.app", name: "Ada", role: "admin", status: "active", accountOwner: true, lastSeenAt: 100 });
  });

  it("adds only one first member when two first requests race", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      const [one, two] = await Promise.all([first(repo, A, "m1", "1"), first(repo, A, "m2", "2")]);
      return { winners: [one, two].filter((member) => member !== undefined).length, rows: await db.select().from(shopMembers) };
    });
    expect(outcome.winners).toBe(1);
    expect(outcome.rows).toHaveLength(1);
  });

  it("adds nothing once someone has opened the app", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await first(repo, A, "m1", "1");
      return { second: await first(repo, A, "m2", "2"), opened: await repo.hasOpenedApp(A) };
    });
    expect(outcome.second).toBeUndefined();
    expect(outcome.opened).toBe(true);
  });

  it.each(["pending", "removed", "active"] as const)("counts a %s member with a Shopify user as someone who opened the app", async (status) => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await db.insert(shopMembers).values({ id: "seen", shop: A, shopifyUserId: "1", role: "viewer", status, createdAt: 1, updatedAt: 1 });
      const repo = new MemberRepo();
      return { created: await first(repo, A, "m2", "2"), opened: await repo.hasOpenedApp(A) };
    });
    expect(outcome.created).toBeUndefined();
    expect(outcome.opened).toBe(true);
  });

  it("does not count an invitation nobody took up as someone who opened the app", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createInvite(A, { id: "i1", email: "i@firesio.app", role: "admin", invitedBy: "nobody", now: 1 });
      const before = await repo.hasOpenedApp(A);
      return { before, created: await first(repo, A, "m1", "1") };
    });
    expect(outcome.before).toBe(false);
    expect(outcome.created).toMatchObject({ id: "m1", status: "active" });
  });

  it("ignores the seat limit: it never asks for one", async () => {
    const created = await inRequest(async () => {
      await seedShops();
      return first(new MemberRepo(), A, "m1", "1");
    });
    expect(created?.status).toBe("active");
  });

  it("writes nothing for a shop we hold no row for", async () => {
    const outcome = await inRequest(async () => {
      const created = await first(new MemberRepo(), "unknown.myshopify.com", "m1", "1");
      return { created, rows: await db.select().from(shopMembers) };
    });
    expect(outcome.created).toBeUndefined();
    expect(outcome.rows).toEqual([]);
  });

  it("answers undefined, not an error, when the same Shopify user already has a row", async () => {
    const second = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.create(A, { ...person("m1", "1"), role: "viewer", status: "pending", now: 1 }, null);
      return first(repo, A, "m2", "1", {}, "admin", 2);
    });
    expect(second).toBeUndefined();
  });

  it("asks per shop: someone in another shop is not someone who opened this one", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await first(repo, B, "b1", "1");
      return { openedA: await repo.hasOpenedApp(A), openedB: await repo.hasOpenedApp(B), createdInA: await first(repo, A, "a1", "1") };
    });
    expect(outcome.openedA).toBe(false);
    expect(outcome.openedB).toBe(true);
    expect(outcome.createdInA).toMatchObject({ id: "a1", shop: A });
  });
});

describe("create and find", () => {
  it("adds a member and finds them by Shopify user id", async () => {
    const found = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.create(A, { ...person("m1", "7", { email: "X@Firesio.app" }), role: "member", status: "active", now: 5 }, null);
      return repo.findByUserId(A, "7");
    });
    expect(found).toMatchObject({ id: "m1", role: "member", status: "active", email: "x@firesio.app", shopifyUserId: "7", invitedBy: null });
  });

  it("answers `exists` when the same user is added twice, and keeps the first row", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      const first = await repo.create(A, { ...person("m1", "7"), role: "member", status: "active", now: 1 }, null);
      const second = await repo.create(A, { ...person("m2", "7"), role: "admin", status: "active", now: 2 }, null);
      return { first, second, rows: await db.select().from(shopMembers) };
    });
    expect(outcome.first.kind).toBe("created");
    expect(outcome.second).toEqual({ kind: "exists" });
    expect(outcome.rows.map((row) => [row.id, row.role])).toEqual([["m1", "member"]]);
  });

  it("keeps two shops' members apart: one Shopify user can belong to both, and neither sees the other", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.create(A, { ...person("a1", "7"), role: "admin", status: "active", now: 1 }, null);
      await repo.create(B, { ...person("b1", "7"), role: "viewer", status: "active", now: 1 }, null);
      return { inA: await repo.findByUserId(A, "7"), inB: await repo.findByUserId(B, "7"), inNone: await repo.findByUserId("other.myshopify.com", "7") };
    });
    expect(outcome.inA).toMatchObject({ id: "a1", role: "admin" });
    expect(outcome.inB).toMatchObject({ id: "b1", role: "viewer" });
    expect(outcome.inNone).toBeUndefined();
  });

  it("cannot be asked about a member of another shop by their email, invitation or whether the app was opened", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createFirstMemberIfNone(A, { ...person("a1", "1", { email: "boss@firesio.app" }), role: "owner", now: 1 });
      await repo.createInvite(A, { id: "i1", email: "new@firesio.app", role: "member", invitedBy: "a1", now: 1 });
      return {
        invite: await repo.findInviteByEmail(B, "new@firesio.app"),
        open: await repo.findOpenByEmail(B, "boss@firesio.app"),
        opened: await repo.hasOpenedApp(B),
      };
    });
    expect(outcome).toEqual({ invite: undefined, open: undefined, opened: false });
  });
});

describe("invitations", () => {
  it("are found by email in any case, and carry the role and who asked", async () => {
    const found = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createInvite(A, { id: "i1", email: "  New@Firesio.app ", role: "admin", invitedBy: "m1", now: 3 });
      return repo.findInviteByEmail(A, "NEW@firesio.app");
    });
    expect(found).toMatchObject({ id: "i1", email: "new@firesio.app", role: "admin", status: "invited", shopifyUserId: null, invitedBy: "m1" });
  });

  it("are not found once taken up, removed, or for another address", async () => {
    const found = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createInvite(A, { id: "i1", email: "taken@firesio.app", role: "member", invitedBy: "m1", now: 1 });
      await repo.acceptInvite(A, "i1", { shopifyUserId: "9", profile: profile(), now: 2 }, null);
      return { taken: await repo.findInviteByEmail(A, "taken@firesio.app"), other: await repo.findInviteByEmail(A, "nobody@firesio.app") };
    });
    expect(found).toEqual({ taken: undefined, other: undefined });
  });

  it("are linked to the person who opens the app, once", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createInvite(A, { id: "i1", email: "new@firesio.app", role: "member", invitedBy: "m1", now: 1 });
      const first = await repo.acceptInvite(A, "i1", { shopifyUserId: "9", profile: profile({ name: "New Person", email: "New@Firesio.app" }), now: 5 }, null);
      const second = await repo.acceptInvite(A, "i1", { shopifyUserId: "10", profile: profile(), now: 6 }, null);
      return { first, second, linked: await repo.findByUserId(A, "9") };
    });
    expect(outcome.first).toMatchObject({ status: "active", shopifyUserId: "9", name: "New Person", role: "member", lastSeenAt: 5 });
    expect(outcome.second).toBeUndefined();
    expect(outcome.linked?.id).toBe("i1");
  });

  it("cannot be taken up by a user who already has a membership: it answers undefined instead of failing", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.create(A, { ...person("m1", "9"), role: "viewer", status: "pending", now: 1 }, null);
      await repo.createInvite(A, { id: "i1", email: "new@firesio.app", role: "admin", invitedBy: "m0", now: 1 });
      return { taken: await repo.acceptInvite(A, "i1", { shopifyUserId: "9", profile: profile(), now: 2 }, null), invite: await repo.findInviteByEmail(A, "new@firesio.app") };
    });
    expect(outcome.taken).toBeUndefined();
    expect(outcome.invite?.id).toBe("i1");
  });

  it("cannot be taken up through another shop", async () => {
    const taken = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createInvite(A, { id: "i1", email: "new@firesio.app", role: "member", invitedBy: "m1", now: 1 });
      return repo.acceptInvite(B, "i1", { shopifyUserId: "9", profile: profile(), now: 2 }, null);
    });
    expect(taken).toBeUndefined();
  });

  it("show up as an open membership for their email, so they are not invited twice", async () => {
    const open = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createInvite(A, { id: "i1", email: "new@firesio.app", role: "member", invitedBy: "m1", now: 1 });
      return repo.findOpenByEmail(A, "NEW@firesio.app");
    });
    expect(open?.id).toBe("i1");
  });
});

describe("restoreOwner and recordSeen", () => {
  it("makes a removed member an active owner again, in their own shop only", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.create(A, { ...person("m1", "7"), role: "viewer", status: "pending", now: 1 }, null);
      const wrongShop = await repo.restoreOwner(B, "m1", profile(), 2);
      const restored = await repo.restoreOwner(A, "m1", profile({ accountOwner: true, email: "o@firesio.app" }), 3);
      return { wrongShop, restored };
    });
    expect(outcome.wrongShop).toBeUndefined();
    expect(outcome.restored).toMatchObject({ role: "owner", status: "active", accountOwner: true, email: "o@firesio.app", updatedAt: 3 });
  });

  it("keeps a known email and name when Shopify sends none, and updates them when it does", async () => {
    const rows = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.create(A, { ...person("m1", "7", { email: "a@firesio.app", name: "Ada" }), role: "member", status: "active", now: 1 }, null);
      await repo.recordSeen(A, "m1", profile(), 10);
      const unchanged = await repo.findByUserId(A, "7");
      await repo.recordSeen(A, "m1", profile({ email: "New@Firesio.app", name: "Ada L", accountOwner: true }), 20);
      return { unchanged, changed: await repo.findByUserId(A, "7") };
    });
    expect(rows.unchanged).toMatchObject({ email: "a@firesio.app", name: "Ada", lastSeenAt: 10 });
    expect(rows.changed).toMatchObject({ email: "new@firesio.app", name: "Ada L", accountOwner: true, lastSeenAt: 20 });
  });

  it("records a sighting only for the shop named", async () => {
    const seen = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.create(A, { ...person("m1", "7"), role: "member", status: "active", now: 1 }, null);
      await repo.recordSeen(B, "m1", profile(), 99);
      return repo.findByUserId(A, "7");
    });
    expect(seen?.lastSeenAt).toBe(1);
  });
});

describe("what the code no longer knows", () => {
  it("reads an unknown role as viewer and an unknown status as removed: neither widens access", async () => {
    const found = await inRequest(async () => {
      await seedShops();
      await env.DB.prepare("INSERT INTO shop_members (id, shop, shopify_user_id, role, status, created_at, updated_at) VALUES ('m1', ?, '7', 'god', 'suspended', 1, 1)").bind(A).run();
      return new MemberRepo().findByUserId(A, "7");
    });
    expect(found).toMatchObject({ role: "viewer", status: "removed" });
  });
});

describe("seats", () => {
  /** An owner, plus `active` more members, so a cap is measured against a known count. */
  async function shopWith(active: number) {
    await seedShops();
    const repo = new MemberRepo();
    await repo.createFirstMemberIfNone(A, { ...person("owner", "o"), role: "owner", now: 1 });
    for (let index = 1; index < active; index += 1) await repo.create(A, { ...person(`m${index}`, `u${index}`), role: "member", status: "active", now: 1 }, null);
    return repo;
  }
  const created = (outcome: Awaited<ReturnType<MemberRepo["create"]>>) => (outcome.kind === "created" ? outcome.member : undefined);

  it("adds an active member while the cap leaves a seat, and a pending one when it does not", async () => {
    const statuses = await inRequest(async () => {
      const repo = await shopWith(2);
      const within = await repo.create(A, { ...person("in", "u9"), role: "member", status: "active", now: 2 }, 3);
      const full = await repo.create(A, { ...person("out", "u10"), role: "member", status: "active", now: 2 }, 3);
      return [created(within)?.status, created(full)?.status];
    });
    expect(statuses).toEqual(["active", "pending"]);
  });

  it("keeps a member that was only ever asked to be pending pending, whatever the cap", async () => {
    const status = await inRequest(async () => {
      const repo = await shopWith(1);
      return created(await repo.create(A, { ...person("w", "u9"), role: "viewer", status: "pending", now: 2 }, null))?.status;
    });
    expect(status).toBe("pending");
  });

  it("has no limit when the cap is null", async () => {
    const statuses = await inRequest(async () => {
      const repo = await shopWith(1);
      const outcomes = await Promise.all([1, 2, 3, 4, 5].map((index) => repo.create(A, { ...person(`m${index}`, `u${index}`), role: "member", status: "active", now: 2 }, null)));
      return outcomes.map((outcome) => created(outcome)?.status);
    });
    expect(statuses).toEqual(["active", "active", "active", "active", "active"]);
  });

  it("gives nobody a seat when the cap is zero", async () => {
    const status = await inRequest(async () => created(await (await shopWith(1)).create(A, { ...person("x", "u9"), role: "member", status: "active", now: 2 }, 0))?.status);
    expect(status).toBe("pending");
  });

  it("never gives the last seat to two requests that arrive together", async () => {
    const outcome = await inRequest(async () => {
      const repo = await shopWith(1);
      const results = await Promise.all([1, 2, 3, 4].map((index) => repo.create(A, { ...person(`m${index}`, `u${index}`), role: "member", status: "active", now: 2 }, 3)));
      return { statuses: results.map((result) => created(result)?.status).sort(), active: (await repo.countByStatus(A)).active };
    });
    // The owner holds one of three seats: exactly two of the four get one, the rest wait.
    expect(outcome.statuses).toEqual(["active", "active", "pending", "pending"]);
    expect(outcome.active).toBe(3);
  });

  it("counts seats per shop: another shop's members take none of this shop's", async () => {
    const status = await inRequest(async () => {
      const repo = await shopWith(1);
      await repo.createFirstMemberIfNone(B, { ...person("ob", "ob"), role: "owner", now: 1 });
      for (let index = 0; index < 5; index += 1) await repo.create(B, { ...person(`b${index}`, `bu${index}`), role: "member", status: "active", now: 1 }, null);
      return created(await repo.create(A, { ...person("a2", "u9"), role: "member", status: "active", now: 2 }, 2))?.status;
    });
    expect(status).toBe("active");
  });

  it("does not count pending, invited or removed members", async () => {
    const status = await inRequest(async () => {
      const repo = await shopWith(1);
      await repo.create(A, { ...person("p", "u1"), role: "viewer", status: "pending", now: 1 }, null);
      await repo.createInvite(A, { id: "i", email: "i@firesio.app", role: "member", invitedBy: "owner", now: 1 });
      await db.insert(shopMembers).values({ id: "r", shop: A, shopifyUserId: "u2", role: "member", status: "removed", createdAt: 1, updatedAt: 1 });
      return created(await repo.create(A, { ...person("n", "u9"), role: "member", status: "active", now: 2 }, 2))?.status;
    });
    expect(status).toBe("active");
  });

  it("makes a taken-up invitation pending when no seat is left", async () => {
    const outcome = await inRequest(async () => {
      const repo = await shopWith(2);
      await repo.createInvite(A, { id: "i1", email: "a@firesio.app", role: "admin", invitedBy: "owner", now: 1 });
      await repo.createInvite(A, { id: "i2", email: "b@firesio.app", role: "admin", invitedBy: "owner", now: 1 });
      const first = await repo.acceptInvite(A, "i1", { shopifyUserId: "7", profile: profile(), now: 2 }, 3);
      const second = await repo.acceptInvite(A, "i2", { shopifyUserId: "8", profile: profile(), now: 2 }, 3);
      return [first?.status, second?.status, second?.role];
    });
    expect(outcome).toEqual(["active", "pending", "admin"]);
  });
});

describe("activate", () => {
  async function team() {
    await seedShops();
    const repo = new MemberRepo();
    await repo.createFirstMemberIfNone(A, { ...person("owner", "o"), role: "owner", now: 1 });
    await repo.create(A, { ...person("wait", "w"), role: "viewer", status: "pending", now: 1 }, null);
    await db.insert(shopMembers).values({ id: "gone", shop: A, shopifyUserId: "g", role: "member", status: "removed", createdAt: 1, updatedAt: 1 });
    return repo;
  }

  it("lets a pending member in with the role chosen, only from the statuses named", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team();
      const wrongFrom = await repo.activate(A, "wait", { from: ["removed"], role: "member", cap: null, now: 5 });
      const activated = await repo.activate(A, "wait", { from: ["pending"], role: "member", cap: null, now: 6 });
      return { wrongFrom, activated };
    });
    expect(outcome.wrongFrom).toBeUndefined();
    expect(outcome.activated).toMatchObject({ status: "active", role: "member", updatedAt: 6 });
  });

  it("restores a removed member", async () => {
    const restored = await inRequest(async () => (await team()).activate(A, "gone", { from: ["removed"], role: "viewer", cap: null, now: 5 }));
    expect(restored).toMatchObject({ status: "active", role: "viewer" });
  });

  it("refuses when the cap leaves no seat, and changes nothing", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team();
      const refused = await repo.activate(A, "wait", { from: ["pending"], role: "member", cap: 1, now: 5 });
      return { refused, still: (await repo.findById(A, "wait"))?.status };
    });
    expect(outcome.refused).toBeUndefined();
    expect(outcome.still).toBe("pending");
  });

  it("works only inside the shop named", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team();
      return repo.activate(B, "wait", { from: ["pending"], role: "member", cap: null, now: 5 });
    });
    expect(outcome).toBeUndefined();
  });
});

describe("setRole and remove", () => {
  async function owners(count: number) {
    await seedShops();
    const repo = new MemberRepo();
    await repo.createFirstMemberIfNone(A, { ...person("o1", "1"), role: "owner", now: 1 });
    for (let index = 2; index <= count; index += 1) await repo.create(A, { ...person(`o${index}`, `${index}`), role: "owner", status: "active", now: 1 }, null);
    await repo.create(A, { ...person("m", "9"), role: "member", status: "active", now: 1 }, null);
    return repo;
  }

  it("changes someone's role", async () => {
    const changed = await inRequest(async () => (await owners(1)).setRole(A, "m", "admin", 5));
    expect(changed).toMatchObject({ role: "admin", updatedAt: 5 });
  });

  it("refuses to demote the last active owner, and keeps them owner", async () => {
    const outcome = await inRequest(async () => {
      const repo = await owners(1);
      return { refused: await repo.setRole(A, "o1", "admin", 5), stillOwner: (await repo.findById(A, "o1"))?.role };
    });
    expect(outcome.refused).toBeUndefined();
    expect(outcome.stillOwner).toBe("owner");
  });

  it("allows demoting an owner while another active owner remains, and then protects the last", async () => {
    const outcome = await inRequest(async () => {
      const repo = await owners(2);
      const first = await repo.setRole(A, "o1", "admin", 5);
      const second = await repo.setRole(A, "o2", "admin", 6);
      return { first: first?.role, second };
    });
    expect(outcome).toEqual({ first: "admin", second: undefined });
  });

  it("does not count a removed owner as one that remains", async () => {
    const outcome = await inRequest(async () => {
      const repo = await owners(2);
      await db.insert(shopMembers).values({ id: "ox", shop: A, shopifyUserId: "x", role: "owner", status: "removed", createdAt: 1, updatedAt: 1 });
      await repo.remove(A, "o2", 5);
      return repo.setRole(A, "o1", "member", 6);
    });
    expect(outcome).toBeUndefined();
  });

  it("removes a member, once", async () => {
    const outcome = await inRequest(async () => {
      const repo = await owners(1);
      const first = await repo.remove(A, "m", 5);
      const again = await repo.remove(A, "m", 6);
      return { first: first?.status, again };
    });
    expect(outcome).toEqual({ first: "removed", again: undefined });
  });

  it("refuses to remove the last active owner, and allows it once another exists", async () => {
    const outcome = await inRequest(async () => {
      const lone = await owners(1);
      const refused = await lone.remove(A, "o1", 5);
      await lone.create(A, { ...person("o2", "2"), role: "owner", status: "active", now: 1 }, null);
      return { refused, allowed: (await lone.remove(A, "o1", 6))?.status };
    });
    expect(outcome).toEqual({ refused: undefined, allowed: "removed" });
  });

  it("promotes to owner without any guard", async () => {
    const promoted = await inRequest(async () => (await owners(1)).setRole(A, "m", "owner", 5));
    expect(promoted?.role).toBe("owner");
  });

  it("cannot reach a member of another shop", async () => {
    const outcome = await inRequest(async () => {
      const repo = await owners(1);
      return { role: await repo.setRole(B, "m", "viewer", 5), removed: await repo.remove(B, "m", 5), still: (await repo.findById(A, "m"))?.status };
    });
    expect(outcome).toEqual({ role: undefined, removed: undefined, still: "active" });
  });
});

describe("the last active team manager", () => {
  /** `roles` are the active members of A, in order; a member is "m0", "m1" ... with user ids "0", "1" ... */
  async function team(roles: readonly MemberRole[]) {
    await seedShops();
    const repo = new MemberRepo();
    for (const [index, role] of roles.entries()) await repo.create(A, { ...person(`m${index}`, `${index}`), role, status: "active", now: 1 }, null);
    return repo;
  }

  it("refuses to remove the only active admin of a shop with no owner, and removes one of two", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin", "member"]);
      const refused = await repo.remove(A, "m0", 5);
      await repo.create(A, { ...person("m9", "9"), role: "admin", status: "active", now: 2 }, null);
      return { refused, allowed: (await repo.remove(A, "m0", 6))?.status };
    });
    expect(outcome).toEqual({ refused: undefined, allowed: "removed" });
  });

  it("refuses to demote the only active admin, and allows it while an owner remains", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin"]);
      const refused = await repo.setRole(A, "m0", "member", 5);
      await repo.create(A, { ...person("o", "o"), role: "owner", status: "active", now: 2 }, null);
      return { refused, stillAdmin: (await repo.findById(A, "m0"))?.role, allowed: (await repo.setRole(A, "m0", "member", 6))?.role };
    });
    expect(outcome).toEqual({ refused: undefined, stillAdmin: "admin", allowed: "member" });
  });

  it("lets the last manager change to another role that also manages the team", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin"]);
      return (await repo.setRole(A, "m0", "owner", 5))?.role;
    });
    expect(outcome).toBe("owner");
  });

  it("lets an owner who is not the last manager be demoted to admin only while it keeps another owner, and always keeps a manager", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner", "owner"]);
      const first = await repo.setRole(A, "m0", "admin", 5);
      const second = await repo.setRole(A, "m1", "admin", 6);
      return { first: first?.role, second };
    });
    expect(outcome).toEqual({ first: "admin", second: undefined });
  });

  it("counts only active managers: a pending or removed admin does not keep the last active one from being protected", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin"]);
      await db.insert(shopMembers).values([
        { id: "gone", shop: A, shopifyUserId: "g", role: "admin", status: "removed", createdAt: 1, updatedAt: 1 },
        { id: "wait", shop: A, shopifyUserId: "w", role: "admin", status: "pending", createdAt: 1, updatedAt: 1 },
      ]);
      return repo.remove(A, "m0", 5);
    });
    expect(outcome).toBeUndefined();
  });

  it("lets exactly one of two admins win when they remove each other at once", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin", "admin"]);
      const results = await Promise.all([repo.remove(A, "m0", 5), repo.remove(A, "m1", 5)]);
      return { landed: results.filter((result) => result !== undefined).length, active: (await repo.countByStatus(A)).active };
    });
    expect(outcome).toEqual({ landed: 1, active: 1 });
  });

  it("lets exactly one of two admins win when they demote each other at once", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin", "admin"]);
      const results = await Promise.all([repo.setRole(A, "m0", "viewer", 5), repo.setRole(A, "m1", "viewer", 5)]);
      return results.filter((result) => result !== undefined).length;
    });
    expect(outcome).toBe(1);
  });

  it("does not let an admin and an owner removing each other at once leave nobody", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin", "owner"]);
      const results = await Promise.all([repo.remove(A, "m0", 5), repo.remove(A, "m1", 5)]);
      return results.filter((result) => result !== undefined).length;
    });
    expect(outcome).toBe(1);
  });

  it("protects a manager only inside their own shop", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin"]);
      await repo.create(B, { ...person("b0", "0"), role: "admin", status: "active", now: 1 }, null);
      return { b: (await repo.remove(B, "b0", 5)) === undefined, a: (await repo.findById(A, "m0"))?.status };
    });
    // B has one admin only, so B's is refused; A's admin is untouched by it.
    expect(outcome).toEqual({ b: true, a: "active" });
  });
});

describe("list and countByStatus", () => {
  it("list a shop's team and no one else's, oldest first", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createFirstMemberIfNone(A, { ...person("a1", "1"), role: "owner", now: 1 });
      await repo.create(A, { ...person("a2", "2"), role: "member", status: "active", now: 2 }, null);
      await repo.createInvite(A, { id: "ai", email: "i@firesio.app", role: "viewer", invitedBy: "a1", now: 3 });
      await repo.createFirstMemberIfNone(B, { ...person("b1", "1"), role: "owner", now: 1 });
      return { team: (await repo.list(A)).map((member) => member.id), other: (await repo.list(B)).map((member) => member.id), counts: await repo.countByStatus(A) };
    });
    expect(outcome.team).toEqual(["a1", "a2", "ai"]);
    expect(outcome.other).toEqual(["b1"]);
    expect(outcome.counts).toEqual({ invited: 1, pending: 0, active: 2, removed: 0, noSeat: 0 });
  });

  it("find a member by id only inside their shop", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createFirstMemberIfNone(A, { ...person("a1", "1"), role: "owner", now: 1 });
      return { own: (await repo.findById(A, "a1"))?.id, foreign: await repo.findById(B, "a1") };
    });
    expect(outcome).toEqual({ own: "a1", foreign: undefined });
  });
});

describe("listWithRoles", () => {
  it("lists a shop's active members of the roles asked for, oldest first, bounded", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createFirstMemberIfNone(A, { ...person("o", "1"), role: "owner", now: 1 });
      await repo.create(A, { ...person("a", "2"), role: "admin", status: "active", now: 2 }, null);
      await repo.create(A, { ...person("m", "3"), role: "member", status: "active", now: 3 }, null);
      await repo.create(A, { ...person("p", "4"), role: "admin", status: "pending", now: 4 }, null);
      await repo.createFirstMemberIfNone(B, { ...person("ob", "1"), role: "owner", now: 1 });
      return {
        managers: (await repo.listWithRoles(A, ["owner", "admin"], 10)).map((member) => member.id),
        bounded: (await repo.listWithRoles(A, ["owner", "admin"], 1)).map((member) => member.id),
        none: await repo.listWithRoles(A, [], 10),
      };
    });
    expect(outcome).toEqual({ managers: ["o", "a"], bounded: ["o"], none: [] });
  });
});

/** A member row seeded directly, so a test can set exactly the fields a trim reads. */
async function seedMember(shop: string, id: string, role: MemberRole, overrides: Partial<typeof shopMembers.$inferInsert> = {}) {
  await db.insert(shopMembers).values({ id, shop, shopifyUserId: `u-${shop}-${id}`, role, status: "active", createdAt: 1, updatedAt: 1, ...overrides });
}

const statusOf = async (id: string) => (await db.select().from(shopMembers).where(eq(shopMembers.id, id)).get())?.status;

describe("trim: taking a seat away", () => {
  it("makes an active member pending and marks when, only while the shop is over the limit", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "o", "owner");
      await seedMember(A, "m1", "member");
      await seedMember(A, "m2", "member");
      const repo = new MemberRepo();
      return { trimmed: await repo.trim(A, "m1", 2, 500), row: await db.select().from(shopMembers).where(eq(shopMembers.id, "m1")).get() };
    });
    expect(outcome.trimmed).toMatchObject({ id: "m1", status: "pending", trimmedAt: 500, updatedAt: 500 });
    expect(outcome.row).toMatchObject({ status: "pending", trimmedAt: 500 });
  });

  it("refuses once the shop is back at its limit: the count that justifies the trim is part of the same statement", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "o", "owner");
      await seedMember(A, "m1", "member");
      await seedMember(A, "m2", "member");
      const repo = new MemberRepo();
      return { atLimit: await repo.trim(A, "m1", 3, 5), overLimit: await repo.trim(A, "m1", 2, 6), status: await statusOf("m1") };
    });
    expect(outcome.atLimit).toBeUndefined();
    expect(outcome.overLimit).toMatchObject({ id: "m1" });
  });

  it("lets two reviews that both want the last seat take exactly one: the shop ends AT its limit, never under it", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "o", "owner");
      for (const id of ["m1", "m2", "m3", "m4"]) await seedMember(A, id, "member");
      const repo = new MemberRepo();
      // Five active, limit four: one seat must go. Every reviewer chose a different victim.
      const results = await Promise.all(["m1", "m2", "m3", "m4"].map((id) => repo.trim(A, id, 4, 9)));
      return { landed: results.filter((member) => member !== undefined).length, active: (await repo.countByStatus(A)).active };
    });
    expect(outcome).toEqual({ landed: 1, active: 4 });
  });

  it("takes the same person once when two reviews both chose them", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "o", "owner");
      await seedMember(A, "m1", "member");
      await seedMember(A, "m2", "member");
      const repo = new MemberRepo();
      const results = await Promise.all([repo.trim(A, "m1", 1, 9), repo.trim(A, "m1", 1, 9)]);
      return { landed: results.filter((member) => member !== undefined).length, m1: await statusOf("m1"), m2: await statusOf("m2") };
    });
    expect(outcome).toEqual({ landed: 1, m1: "pending", m2: "active" });
  });

  it("never takes an owner, nor the person Shopify says owns the store, whatever role they hold", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "o1", "owner");
      await seedMember(A, "o2", "owner");
      await seedMember(A, "store", "admin", { accountOwner: true });
      await seedMember(A, "ada", "admin");
      const repo = new MemberRepo();
      return { owner: await repo.trim(A, "o2", 1, 3), store: await repo.trim(A, "store", 1, 3), admin: await repo.trim(A, "ada", 1, 3) };
    });
    expect(outcome.owner).toBeUndefined();
    expect(outcome.store).toBeUndefined();
    expect(outcome.admin).toMatchObject({ id: "ada", status: "pending" });
  });

  it("never takes the shop's last active team manager, and takes an admin while another manager remains", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "only", "admin");
      await seedMember(A, "viewer", "viewer");
      const repo = new MemberRepo();
      const last = await repo.trim(A, "only", 0, 3);
      await seedMember(A, "second", "admin");
      const second = await repo.trim(A, "only", 1, 4);
      return { last, second, third: await repo.trim(A, "second", 1, 5) };
    });
    expect(outcome.last).toBeUndefined();
    expect(outcome.second).toMatchObject({ id: "only", status: "pending" });
    // "second" is now the last manager.
    expect(outcome.third).toBeUndefined();
  });

  it("two admins trimmed at once never leave the shop with nobody who can manage the team", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "a1", "admin");
      await seedMember(A, "a2", "admin");
      const repo = new MemberRepo();
      const results = await Promise.all([repo.trim(A, "a1", 0, 3), repo.trim(A, "a2", 0, 3)]);
      return { landed: results.filter((member) => member !== undefined).length, managers: (await repo.countByStatus(A)).active };
    });
    expect(outcome).toEqual({ landed: 1, managers: 1 });
  });

  it("only takes an ACTIVE member: pending, invited and removed ones are left as they are", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "o", "owner");
      await seedMember(A, "p", "member", { status: "pending" });
      await seedMember(A, "r", "member", { status: "removed" });
      const repo = new MemberRepo();
      return { pending: await repo.trim(A, "p", 0, 3), removed: await repo.trim(A, "r", 0, 3), unknown: await repo.trim(A, "nobody", 0, 3) };
    });
    expect(outcome).toEqual({ pending: undefined, removed: undefined, unknown: undefined });
  });

  it("cannot reach a member of another shop, and counts only its own shop's seats", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "o", "owner");
      await seedMember(A, "m", "member");
      for (const id of ["b1", "b2", "b3", "b4"]) await seedMember(B, id, "member");
      const repo = new MemberRepo();
      // Shop B's four members do not make shop A (two active) over a limit of two.
      return { within: await repo.trim(A, "m", 2, 3), foreign: await repo.trim(A, "b1", 0, 3), bStatus: await statusOf("b1") };
    });
    expect(outcome).toEqual({ within: undefined, foreign: undefined, bStatus: "active" });
  });

  it("frees the seat at once: the trimmed person no longer counts as active", async () => {
    const counts = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "o", "owner");
      await seedMember(A, "m", "member");
      const repo = new MemberRepo();
      await repo.trim(A, "m", 1, 3);
      return repo.countByStatus(A);
    });
    expect(counts).toMatchObject({ active: 1, pending: 1 });
  });
});

describe("a trimmed member's way back", () => {
  async function trimmedShop() {
    await seedShops();
    await seedMember(A, "o", "owner");
    await seedMember(A, "m", "member");
    const repo = new MemberRepo();
    await repo.trim(A, "m", 1, 3);
    return repo;
  }

  it("is activate, which still needs a free seat, and which clears the trim mark", async () => {
    const outcome = await inRequest(async () => {
      const repo = await trimmedShop();
      const noSeat = await repo.activate(A, "m", { from: ["pending"], role: "member", cap: 1, now: 9 });
      const withSeat = await repo.activate(A, "m", { from: ["pending"], role: "member", cap: 2, now: 10 });
      return { noSeat, withSeat };
    });
    expect(outcome.noSeat).toBeUndefined();
    expect(outcome.withSeat).toMatchObject({ id: "m", status: "active", trimmedAt: null });
  });

  it("clears the mark when the person is removed, so a restore later is not read as a seat problem", async () => {
    const outcome = await inRequest(async () => {
      const repo = await trimmedShop();
      const removed = await repo.remove(A, "m", 12);
      return { removed, found: await repo.findById(A, "m") };
    });
    expect(outcome.removed).toMatchObject({ status: "removed", trimmedAt: null });
    expect(outcome.found?.trimmedAt).toBeNull();
  });

  it("is restoreOwner for the account owner, past any seat limit, and clears the mark too", async () => {
    const restored = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "o", "admin");
      await seedMember(A, "store", "admin", { status: "pending", trimmedAt: 4, accountOwner: true });
      return new MemberRepo().restoreOwner(A, "store", profile({ accountOwner: true }), 20);
    });
    expect(restored).toMatchObject({ role: "owner", status: "active", trimmedAt: null });
  });

  it("reads a pending row with a trim time as trimmed, and a waiting one as not", async () => {
    const found = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "t", "member", { status: "pending", trimmedAt: 7 });
      await seedMember(A, "w", "member", { status: "pending" });
      const repo = new MemberRepo();
      return { t: (await repo.findById(A, "t"))?.trimmedAt, w: (await repo.findById(A, "w"))?.trimmedAt };
    });
    expect(found).toEqual({ t: 7, w: null });
  });
});

describe("listActive and listShopsWithSeveralActive", () => {
  it("listActive lists a shop's active members, oldest first, and no one else's", async () => {
    const ids = await inRequest(async () => {
      await seedShops();
      await seedMember(A, "late", "member", { createdAt: 5 });
      await seedMember(A, "early", "owner", { createdAt: 1 });
      await seedMember(A, "waiting", "member", { status: "pending" });
      await seedMember(A, "gone", "member", { status: "removed" });
      await seedMember(B, "other", "owner");
      return (await new MemberRepo().listActive(A)).map((member) => member.id);
    });
    expect(ids).toEqual(["early", "late"]);
  });

  it("finds installed shops with more than one active member, in order, after a cursor, bounded", async () => {
    const outcome = await inRequest(async () => {
      const shopNames = ["a.myshopify.com", "b.myshopify.com", "c.myshopify.com", "d.myshopify.com", "e.myshopify.com", "f.myshopify.com"];
      await db.insert(shops).values(shopNames.map((shop, index) => ({ shop, installedAt: 1, relationshipStatus: (index === 4 ? "UNINSTALLED" : index === 5 ? "REACTIVATED" : "INSTALLED") as "INSTALLED" })));
      for (const shop of shopNames) {
        await seedMember(shop, `${shop}-one`, "owner");
        // c has only one active member (the second is pending): it cannot be over any limit a trim acts on.
        await seedMember(shop, `${shop}-two`, "member", shop === "c.myshopify.com" ? { status: "pending" } : {});
      }
      const repo = new MemberRepo();
      return {
        all: await repo.listShopsWithSeveralActive(null, 10),
        afterB: await repo.listShopsWithSeveralActive("b.myshopify.com", 10),
        bounded: await repo.listShopsWithSeveralActive(null, 2),
      };
    });
    // e is uninstalled (not operational) and c has one active member; f is REACTIVATED, which is operational.
    expect(outcome.all).toEqual(["a.myshopify.com", "b.myshopify.com", "d.myshopify.com", "f.myshopify.com"]);
    expect(outcome.afterB).toEqual(["d.myshopify.com", "f.myshopify.com"]);
    expect(outcome.bounded).toEqual(["a.myshopify.com", "b.myshopify.com"]);
  });

  it("finds nothing for a shop we hold no row for", async () => {
    const found = await inRequest(async () => {
      await seedMember("ghost.myshopify.com", "ghost-one", "owner");
      await seedMember("ghost.myshopify.com", "ghost-two", "member");
      return new MemberRepo().listShopsWithSeveralActive(null, 10);
    });
    expect(found).toEqual([]);
  });
});

describe("a member's own set of permissions", () => {
  /** `roles` are the active members of A, in order: "m0", "m1" ... with user ids "0", "1" ... */
  async function team(roles: readonly MemberRole[]) {
    await seedShops();
    const repo = new MemberRepo();
    for (const [index, role] of roles.entries()) await repo.create(A, { ...person(`m${index}`, `${index}`), role, status: "active", now: 1 }, null);
    return repo;
  }

  it("is written whole, in the registry's order, and the role they were based on stays", async () => {
    const changed = await inRequest(async () => (await team(["owner", "member"])).setPermissions(A, "m1", ["app:manage", "app:view"], 5));
    expect(changed).toMatchObject({ id: "m1", role: "member", permissions: ["app:view", "app:manage"], updatedAt: 5 });
  });

  it("reads back as the same set, and a member who was never given one reads as having none", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner", "member"]);
      await repo.setPermissions(A, "m1", ["app:view"], 5);
      return { custom: (await repo.findById(A, "m1"))?.permissions, preset: (await repo.findById(A, "m0"))?.permissions };
    });
    expect(outcome).toEqual({ custom: ["app:view"], preset: null });
  });

  it("can name the role it is based on in the same write, and a write without one leaves the role alone", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner", "member", "member"]);
      const withRole = await repo.setPermissions(A, "m1", ["app:view"], 5, "viewer");
      const without = await repo.setPermissions(A, "m2", ["app:view"], 5);
      return { withRole, without };
    });
    expect(outcome.withRole).toMatchObject({ role: "viewer", permissions: ["app:view"], updatedAt: 5 });
    expect(outcome.without).toMatchObject({ role: "member", permissions: ["app:view"] });
  });

  it("is refused, and the role stays, when the member is the last team manager: a set takes them out of managing", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin"]);
      return { refused: await repo.setPermissions(A, "m0", ["app:view"], 5, "member"), role: (await repo.findById(A, "m0"))?.role };
    });
    expect(outcome).toEqual({ refused: undefined, role: "admin" });
  });

  it("is replaced, not merged, by the next one", async () => {
    const found = await inRequest(async () => {
      const repo = await team(["owner", "member"]);
      await repo.setPermissions(A, "m1", ["app:view", "app:manage"], 5);
      await repo.setPermissions(A, "m1", ["app:view", "billing:manage"], 6);
      return (await repo.findById(A, "m1"))?.permissions;
    });
    expect(found).toEqual(["app:view", "billing:manage"]);
  });

  it("is refused for a member who is not active, and changes nothing", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner"]);
      await seedMember(A, "p", "member", { status: "pending" });
      await seedMember(A, "r", "member", { status: "removed" });
      await seedMember(A, "i", "member", { status: "invited", shopifyUserId: null });
      return {
        results: await Promise.all(["p", "r", "i"].map((id) => repo.setPermissions(A, id, ["app:view"], 5))),
        stored: await Promise.all(["p", "r", "i"].map(async (id) => (await repo.findById(A, id))?.permissions)),
      };
    });
    expect(outcome.results).toEqual([undefined, undefined, undefined]);
    expect(outcome.stored).toEqual([null, null, null]);
  });

  it("is refused for an owner, and for the person Shopify says owns the store, whatever role they hold", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner", "owner"]);
      await seedMember(A, "so", "admin", { accountOwner: true });
      return { owner: await repo.setPermissions(A, "m1", ["app:view"], 5), accountOwner: await repo.setPermissions(A, "so", ["app:view"], 5) };
    });
    expect(outcome).toEqual({ owner: undefined, accountOwner: undefined });
  });

  it("cannot reach a member of another shop", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner", "member"]);
      await repo.create(B, { ...person("b1", "7"), role: "member", status: "active", now: 1 }, null);
      return { refused: await repo.setPermissions(B, "m1", ["app:view"], 5), mine: (await repo.findById(A, "m1"))?.permissions };
    });
    expect(outcome).toEqual({ refused: undefined, mine: null });
  });

  it("is refused for the last active team manager, and allowed while another remains", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin", "member"]);
      const refused = await repo.setPermissions(A, "m0", ["app:view"], 5);
      await repo.create(A, { ...person("o", "o"), role: "owner", status: "active", now: 2 }, null);
      return { refused, stillPreset: (await repo.findById(A, "m0"))?.permissions, allowed: (await repo.setPermissions(A, "m0", ["app:view"], 6))?.permissions };
    });
    expect(outcome).toEqual({ refused: undefined, stillPreset: null, allowed: ["app:view"] });
  });

  it("lets exactly one of two admins win when they give each other a set at once", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin", "admin"]);
      const results = await Promise.all([repo.setPermissions(A, "m0", ["app:view"], 5), repo.setPermissions(A, "m1", ["app:view"], 5)]);
      return results.filter((result) => result !== undefined).length;
    });
    expect(outcome).toBe(1);
  });

  it("does not count someone who has a set as a team manager, whatever role they were based on", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["admin", "admin", "admin"]);
      await repo.setPermissions(A, "m2", ["app:view"], 5);
      // m2 is an admin by role and no manager by set. With m0 gone, m1 is the last manager and cannot be removed.
      await repo.remove(A, "m0", 6);
      return { lastManager: await repo.remove(A, "m1", 7), listed: (await repo.listWithRoles(A, ["admin"], 10)).map((member) => member.id) };
    });
    expect(outcome.lastManager).toBeUndefined();
    expect(outcome.listed).toEqual(["m1"]);
  });

  it("is dropped when a role is chosen: applying a preset replaces the set", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner", "member"]);
      await repo.setPermissions(A, "m1", ["app:view"], 5);
      return (await repo.setRole(A, "m1", "admin", 6))?.permissions;
    });
    expect(outcome).toBeNull();
  });

  it("is dropped when a member is let in or restored, so a returning person gets a role's preset, not an old set", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner", "member"]);
      await repo.setPermissions(A, "m1", ["app:view"], 5);
      await repo.remove(A, "m1", 6);
      return (await repo.activate(A, "m1", { from: ["removed"], role: "member", cap: null, now: 7 }))?.permissions;
    });
    expect(outcome).toBeNull();
  });

  it("is dropped when the store's owner is restored as owner", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner", "member"]);
      await repo.setPermissions(A, "m1", ["app:view"], 5);
      return (await repo.restoreOwner(A, "m1", profile({ accountOwner: true }), 6))?.permissions;
    });
    expect(outcome).toBeNull();
  });

  it("is dropped when someone is removed, so nothing of it is kept past their membership", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner", "member"]);
      await repo.setPermissions(A, "m1", ["app:view"], 5);
      return (await repo.remove(A, "m1", 6))?.permissions;
    });
    expect(outcome).toBeNull();
  });

  it("is never given to anyone by a new membership: a created member and a taken-up invitation start on their role", async () => {
    const outcome = await inRequest(async () => {
      const repo = await team(["owner"]);
      await repo.createInvite(A, { id: "inv", email: "i@firesio.app", role: "viewer", invitedBy: "m0", now: 2 });
      const accepted = await repo.acceptInvite(A, "inv", { shopifyUserId: "50", profile: profile(), now: 3 }, null);
      const created = await repo.create(A, { ...person("n", "51"), role: "member", status: "active", now: 4 }, null);
      return { accepted: accepted?.permissions, created: created.kind === "created" ? created.member.permissions : "exists" };
    });
    expect(outcome).toEqual({ accepted: null, created: null });
  });

  it("says so in the log, by shop hash and with nothing of the value, when a stored value is damaged", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await inRequest(async () => {
      await seedShops();
      await env.DB.prepare("INSERT INTO shop_members (id, shop, shopify_user_id, role, status, permissions, created_at, updated_at) VALUES ('d1', ?, '70', 'admin', 'active', 'secret-garbage', 1, 1)").bind(A).run();
      await env.DB.prepare("INSERT INTO shop_members (id, shop, shopify_user_id, role, status, permissions, created_at, updated_at) VALUES ('ok', ?, '71', 'admin', 'active', '[\"app:view\"]', 1, 1)").bind(A).run();
      await new MemberRepo().list(A);
    });
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    const output = log.mock.calls.map((call) => String(call[0]));
    log.mockRestore();
    expect(output.filter((line) => line.includes("member.permissions_damaged"))).toHaveLength(1);
    expect(output.join("\n")).not.toContain(A);
    expect(output.join("\n")).not.toContain("secret-garbage");
  });

  it("is read as an empty set when the stored value is damaged, never as the role's preset", async () => {
    const found = await inRequest(async () => {
      await seedShops();
      await env.DB.prepare("INSERT INTO shop_members (id, shop, shopify_user_id, role, status, permissions, created_at, updated_at) VALUES ('d1', ?, '70', 'admin', 'active', 'not json', 1, 1)").bind(A).run();
      await env.DB.prepare("INSERT INTO shop_members (id, shop, shopify_user_id, role, status, permissions, created_at, updated_at) VALUES ('d2', ?, '71', 'admin', 'active', '[\"app:view\",\"retired:thing\"]', 1, 1)").bind(A).run();
      const repo = new MemberRepo();
      return { damaged: (await repo.findById(A, "d1"))?.permissions, unknownName: (await repo.findById(A, "d2"))?.permissions };
    });
    expect(found).toEqual({ damaged: [], unknownName: ["app:view"] });
  });
});

describe("an invitation is not a person", () => {
  const invite = (repo: MemberRepo, shop: string, id: string) => repo.createInvite(shop, { id, email: `${id}@firesio.app`, role: "viewer", invitedBy: "boss", now: 3 });
  const row = (shop: string, id: string, overrides: Partial<typeof shopMembers.$inferInsert> = {}): typeof shopMembers.$inferInsert => ({ id, shop, role: "viewer", status: "removed", createdAt: 1, updatedAt: 1, ...overrides });

  it("cancels an open invitation by deleting it, and nothing else of the team changes", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createFirstMemberIfNone(A, { ...person("o", "1"), role: "owner", now: 1 });
      await invite(repo, A, "inv");
      const cancelled = await repo.cancelInvite(A, "inv");
      return { cancelled: cancelled?.id, rows: (await db.select().from(shopMembers)).map((member) => member.id), again: await repo.cancelInvite(A, "inv") };
    });
    expect(outcome).toEqual({ cancelled: "inv", rows: ["o"], again: undefined });
  });

  it("cancels only inside the shop named: another shop's invitation id is untouched", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await invite(repo, A, "inv");
      const foreign = await repo.cancelInvite(B, "inv");
      return { foreign, kept: (await repo.findById(A, "inv"))?.status };
    });
    expect(outcome).toEqual({ foreign: undefined, kept: "invited" });
  });

  it("never deletes a person: a linked member, in any status, is refused", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await db.insert(shopMembers).values((["invited", "pending", "active", "removed"] as const).map((status) => row(A, `p-${status}`, { status, shopifyUserId: `u-${status}` })));
      const repo = new MemberRepo();
      const results = await Promise.all((["invited", "pending", "active", "removed"] as const).map((status) => repo.cancelInvite(A, `p-${status}`)));
      return { results, left: (await db.select().from(shopMembers)).length };
    });
    expect(outcome).toEqual({ results: [undefined, undefined, undefined, undefined], left: 4 });
  });

  it("will not mark an invitation removed: it is cancelled, never parked where it could be restored", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await invite(repo, A, "inv");
      return { removed: await repo.remove(A, "inv", 5), status: (await repo.findById(A, "inv"))?.status };
    });
    expect(outcome).toEqual({ removed: undefined, status: "invited" });
  });

  it("will not activate a row with no Shopify user, with a seat free, from any status, and holds no seat for it", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      // Rows no longer arise this way (cancelling deletes), but old data can hold them and the store must still refuse.
      await db.insert(shopMembers).values([row(A, "old"), row(A, "inv", { status: "invited" }), row(A, "wait", { status: "pending" })]);
      const repo = new MemberRepo();
      const results = [
        await repo.activate(A, "old", { from: ["removed"], role: "member", cap: null, now: 5 }),
        await repo.activate(A, "inv", { from: ["invited"], role: "member", cap: 10, now: 5 }),
        await repo.activate(A, "wait", { from: ["pending"], role: "member", cap: 10, now: 5 }),
      ];
      return { results, active: (await repo.countByStatus(A)).active };
    });
    expect(outcome).toEqual({ results: [undefined, undefined, undefined], active: 0 });
  });

  it("leaves a cancelled invitation of the old kind out of the list and the counts, in its own shop only", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await db.insert(shopMembers).values([row(A, "old"), row(A, "gone", { shopifyUserId: "7" }), row(B, "other-old")]);
      const repo = new MemberRepo();
      return { listA: (await repo.list(A)).map((member) => member.id), listB: (await repo.list(B)).map((member) => member.id), countsA: await repo.countByStatus(A) };
    });
    expect(outcome.listA).toEqual(["gone"]);
    expect(outcome.listB).toEqual([]);
    expect(outcome.countsA).toEqual({ invited: 0, pending: 0, active: 0, removed: 1, noSeat: 0 });
  });
});

describe("countByStatus tells waiting from no seat", () => {
  it("counts the pending people who lost a seat apart from those waiting, per shop", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await db.insert(shopMembers).values([
        { id: "w1", shop: A, shopifyUserId: "1", role: "viewer", status: "pending", createdAt: 1, updatedAt: 1 },
        { id: "w2", shop: A, shopifyUserId: "2", role: "viewer", status: "pending", createdAt: 1, updatedAt: 1 },
        { id: "t1", shop: A, shopifyUserId: "3", role: "viewer", status: "pending", trimmedAt: 9, createdAt: 1, updatedAt: 1 },
        { id: "act", shop: A, shopifyUserId: "4", role: "viewer", status: "active", createdAt: 1, updatedAt: 1 },
        { id: "bt", shop: B, shopifyUserId: "5", role: "viewer", status: "pending", trimmedAt: 9, createdAt: 1, updatedAt: 1 },
      ]);
      const repo = new MemberRepo();
      return { a: await repo.countByStatus(A), b: await repo.countByStatus(B) };
    });
    expect(outcome.a).toEqual({ invited: 0, pending: 3, active: 1, removed: 0, noSeat: 1 });
    expect(outcome.b).toMatchObject({ pending: 1, noSeat: 1 });
  });
});

describe("findWithInviter", () => {
  it("reads a member and the name and address of whoever invited them in one query, in the same shop", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createFirstMemberIfNone(A, { ...person("boss", "1", { name: "Bo", email: "bo@firesio.app" }), role: "owner", now: 1 });
      await repo.createInvite(A, { id: "inv", email: "i@firesio.app", role: "viewer", invitedBy: "boss", now: 2 });
      return { found: await repo.findWithInviter(A, "inv"), boss: await repo.findWithInviter(A, "boss") };
    });
    expect(outcome.found?.member.id).toBe("inv");
    expect(outcome.found?.inviter).toEqual({ name: "Bo", email: "bo@firesio.app" });
    expect(outcome.boss?.inviter).toBeUndefined();
  });

  it("finds no one in another shop, and never names an inviter from another shop even when the id matches", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createFirstMemberIfNone(B, { ...person("boss", "1", { name: "Other shop", email: "x@firesio.app" }), role: "owner", now: 1 });
      await repo.createInvite(A, { id: "inv", email: "i@firesio.app", role: "viewer", invitedBy: "boss", now: 2 });
      return { foreign: await repo.findWithInviter(B, "inv"), inviter: (await repo.findWithInviter(A, "inv"))?.inviter };
    });
    expect(outcome.foreign).toBeUndefined();
    expect(outcome.inviter).toBeUndefined();
  });
});
