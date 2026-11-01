import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { shopMembers, shops } from "~/db/schema";
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

describe("createOwnerIfNone", () => {
  it("makes the first person the owner, active, and records their profile", async () => {
    const created = await inRequest(async () => {
      await seedShops();
      return new MemberRepo().createOwnerIfNone(A, { ...person("m1", "42", { email: "Ada@Firesio.app", name: "Ada", accountOwner: true }), now: 100 });
    });
    expect(created).toMatchObject({ id: "m1", shop: A, shopifyUserId: "42", email: "ada@firesio.app", name: "Ada", role: "owner", status: "active", accountOwner: true, lastSeenAt: 100 });
  });

  it("adds only one owner when two first requests race", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      const [first, second] = await Promise.all([
        repo.createOwnerIfNone(A, { ...person("m1", "1"), now: 1 }),
        repo.createOwnerIfNone(A, { ...person("m2", "2"), now: 1 }),
      ]);
      return { winners: [first, second].filter((member) => member !== undefined).length, rows: await db.select().from(shopMembers) };
    });
    expect(outcome.winners).toBe(1);
    expect(outcome.rows).toHaveLength(1);
  });

  it("adds nothing once the shop has an active owner", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createOwnerIfNone(A, { ...person("m1", "1"), now: 1 });
      return { second: await repo.createOwnerIfNone(A, { ...person("m2", "2"), now: 2 }), has: await repo.hasActiveOwner(A) };
    });
    expect(outcome.second).toBeUndefined();
    expect(outcome.has).toBe(true);
  });

  it("writes nothing for a shop we hold no row for", async () => {
    const outcome = await inRequest(async () => {
      const created = await new MemberRepo().createOwnerIfNone("unknown.myshopify.com", { ...person("m1", "1"), now: 1 });
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
      return repo.createOwnerIfNone(A, { ...person("m2", "1"), now: 2 });
    });
    expect(second).toBeUndefined();
  });

  it("counts an owner who was removed or is still pending as no owner", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      await db.insert(shopMembers).values([
        { id: "gone", shop: A, shopifyUserId: "1", role: "owner", status: "removed", createdAt: 1, updatedAt: 1 },
        { id: "wait", shop: A, shopifyUserId: "2", role: "owner", status: "pending", createdAt: 1, updatedAt: 1 },
      ]);
      return new MemberRepo().hasActiveOwner(A);
    });
    expect(outcome).toBe(false);
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

  it("cannot be asked about a member of another shop by their email, invitation or owner status", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createOwnerIfNone(A, { ...person("a1", "1", { email: "boss@firesio.app" }), now: 1 });
      await repo.createInvite(A, { id: "i1", email: "new@firesio.app", role: "member", invitedBy: "a1", now: 1 });
      return {
        invite: await repo.findInviteByEmail(B, "new@firesio.app"),
        open: await repo.findOpenByEmail(B, "boss@firesio.app"),
        owner: await repo.hasActiveOwner(B),
      };
    });
    expect(outcome).toEqual({ invite: undefined, open: undefined, owner: false });
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
    await repo.createOwnerIfNone(A, { ...person("owner", "o"), now: 1 });
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
      await repo.createOwnerIfNone(B, { ...person("ob", "ob"), now: 1 });
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
    await repo.createOwnerIfNone(A, { ...person("owner", "o"), now: 1 });
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
    await repo.createOwnerIfNone(A, { ...person("o1", "1"), now: 1 });
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

describe("list and countByStatus", () => {
  it("list a shop's team and no one else's, oldest first", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createOwnerIfNone(A, { ...person("a1", "1"), now: 1 });
      await repo.create(A, { ...person("a2", "2"), role: "member", status: "active", now: 2 }, null);
      await repo.createInvite(A, { id: "ai", email: "i@firesio.app", role: "viewer", invitedBy: "a1", now: 3 });
      await repo.createOwnerIfNone(B, { ...person("b1", "1"), now: 1 });
      return { team: (await repo.list(A)).map((member) => member.id), other: (await repo.list(B)).map((member) => member.id), counts: await repo.countByStatus(A) };
    });
    expect(outcome.team).toEqual(["a1", "a2", "ai"]);
    expect(outcome.other).toEqual(["b1"]);
    expect(outcome.counts).toEqual({ invited: 1, pending: 0, active: 2, removed: 0 });
  });

  it("find a member by id only inside their shop", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new MemberRepo();
      await repo.createOwnerIfNone(A, { ...person("a1", "1"), now: 1 });
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
      await repo.createOwnerIfNone(A, { ...person("o", "1"), now: 1 });
      await repo.create(A, { ...person("a", "2"), role: "admin", status: "active", now: 2 }, null);
      await repo.create(A, { ...person("m", "3"), role: "member", status: "active", now: 3 }, null);
      await repo.create(A, { ...person("p", "4"), role: "admin", status: "pending", now: 4 }, null);
      await repo.createOwnerIfNone(B, { ...person("ob", "1"), now: 1 });
      return {
        managers: (await repo.listWithRoles(A, ["owner", "admin"], 10)).map((member) => member.id),
        bounded: (await repo.listWithRoles(A, ["owner", "admin"], 1)).map((member) => member.id),
        none: await repo.listWithRoles(A, [], 10),
      };
    });
    expect(outcome).toEqual({ managers: ["o", "a"], bounded: ["o"], none: [] });
  });
});
