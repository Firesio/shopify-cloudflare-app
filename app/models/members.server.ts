import { and, eq, inArray, isNull, ne, notExists, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { shopMembers, shops, type ShopMemberRow } from "~/db/schema";
import { isMemberRole, type MemberRole } from "~/domain/member-access";
import { isMemberStatus, type MemberStatus } from "~/domain/member-lifecycle";
import type { CreateOutcome, Member, MemberProfile, MemberStore, NewMember, SeatCap } from "~/ports/members";
import { getDb } from "~/request-context.server";

/**
 * Stored values outlive the code that wrote them. A role the code no longer knows reads as `viewer`, the least a member
 * can be, and a status it no longer knows reads as `removed`: out. Neither can widen anyone's access.
 */
function roleOf(value: string): MemberRole {
  return isMemberRole(value) ? value : "viewer";
}
function statusOf(value: string): MemberStatus {
  return isMemberStatus(value) ? value : "removed";
}

function toMember(row: ShopMemberRow): Member {
  return {
    id: row.id,
    shop: row.shop,
    shopifyUserId: row.shopifyUserId,
    email: row.email,
    name: row.name,
    role: roleOf(row.role),
    status: statusOf(row.status),
    accountOwner: row.accountOwner,
    collaborator: row.collaborator,
    invitedBy: row.invitedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastSeenAt: row.lastSeenAt,
  };
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** A shop's team is read whole, up to this many rows. */
const TEAM_LIMIT = 500;

/** D1 reports a unique-index violation only in the message; anything else is a real failure and is not hidden. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(`${error.message} ${String(error.cause ?? "")}`);
}

/** The table seen from inside a subquery: the same name would otherwise shadow the row an UPDATE is changing. */
const other = alias(shopMembers, "other");

/** How many active members the shop has, as an expression for a statement to use. One statement sees one consistent count. */
function activeMembers(shop: string): SQL {
  return sql`${getDb().select({ n: sql`count(*)` }).from(other).where(and(eq(other.shop, shop), eq(other.status, "active")))}`;
}

/** True while the cap leaves a seat. The count and the write that depends on it are ONE statement. */
function hasSeat(shop: string, cap: SeatCap): SQL {
  return cap === null ? sql`1 = 1` : sql`${activeMembers(shop)} < ${cap}`;
}

/** `active` while there is a seat, `pending` otherwise; or `pending` outright when that is all that was asked for. */
function statusFor(shop: string, wanted: "active" | "pending", cap: SeatCap): SQL<MemberStatus> {
  return wanted === "pending" ? sql<MemberStatus>`'pending'` : sql<MemberStatus>`case when ${hasSeat(shop, cap)} then 'active' else 'pending' end`;
}

/** True when the member is NOT the shop's last active owner: the condition a demotion or removal needs. */
function notLastOwner(shop: string): SQL {
  const owners = sql`${getDb()
    .select({ n: sql`count(*)` })
    .from(other)
    .where(and(eq(other.shop, shop), eq(other.role, "owner"), eq(other.status, "active")))}`;
  return sql`not (${shopMembers.role} = 'owner' and ${shopMembers.status} = 'active' and ${owners} <= 1)`;
}

/**
 * The ONLY place `shop_members` is queried. Every query is scoped by `shop`, which is always the first parameter: a
 * member id or an email that comes from a request is attacker-controlled, so no lookup is by id alone.
 */
export class MemberRepo implements MemberStore {
  async findByUserId(shop: string, shopifyUserId: string): Promise<Member | undefined> {
    const row = await getDb()
      .select()
      .from(shopMembers)
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.shopifyUserId, shopifyUserId)))
      .get();
    return row === undefined ? undefined : toMember(row);
  }

  async findById(shop: string, id: string): Promise<Member | undefined> {
    const row = await getDb().select().from(shopMembers).where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id))).get();
    return row === undefined ? undefined : toMember(row);
  }

  async list(shop: string): Promise<readonly Member[]> {
    // Bounded: a store's team is people, and a page must never grow with a runaway table.
    const rows = await getDb().select().from(shopMembers).where(eq(shopMembers.shop, shop)).orderBy(shopMembers.createdAt, shopMembers.id).limit(TEAM_LIMIT);
    return rows.map(toMember);
  }

  async listWithRoles(shop: string, roles: readonly MemberRole[], limit: number): Promise<readonly Member[]> {
    if (roles.length === 0) return [];
    const rows = await getDb()
      .select()
      .from(shopMembers)
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.status, "active"), inArray(shopMembers.role, [...roles])))
      .orderBy(shopMembers.createdAt, shopMembers.id)
      .limit(limit);
    return rows.map(toMember);
  }

  async countByStatus(shop: string): Promise<Readonly<Record<MemberStatus, number>>> {
    const rows = await getDb()
      .select({ status: shopMembers.status, n: sql<number>`count(*)` })
      .from(shopMembers)
      .where(eq(shopMembers.shop, shop))
      .groupBy(shopMembers.status);
    const counts: Record<MemberStatus, number> = { invited: 0, pending: 0, active: 0, removed: 0 };
    for (const row of rows) counts[statusOf(row.status)] += Number(row.n);
    return counts;
  }

  async findInviteByEmail(shop: string, email: string): Promise<Member | undefined> {
    const row = await getDb()
      .select()
      .from(shopMembers)
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.email, normalizeEmail(email)), eq(shopMembers.status, "invited"), isNull(shopMembers.shopifyUserId)))
      .get();
    return row === undefined ? undefined : toMember(row);
  }

  async findOpenByEmail(shop: string, email: string): Promise<Member | undefined> {
    const row = await getDb()
      .select()
      .from(shopMembers)
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.email, normalizeEmail(email)), ne(shopMembers.status, "removed")))
      .get();
    return row === undefined ? undefined : toMember(row);
  }

  async hasActiveOwner(shop: string): Promise<boolean> {
    const row = await getDb()
      .select({ id: shopMembers.id })
      .from(shopMembers)
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.role, "owner"), eq(shopMembers.status, "active")))
      .limit(1)
      .get();
    return row !== undefined;
  }

  async createOwnerIfNone(shop: string, member: Omit<NewMember, "role" | "status">): Promise<Member | undefined> {
    const db = getDb();
    const noOwner = notExists(
      db
        .select({ one: sql`1` })
        .from(shopMembers)
        .where(and(eq(shopMembers.shop, shop), eq(shopMembers.role, "owner"), eq(shopMembers.status, "active"))),
    );
    // ONE statement: the check and the insert cannot be separated by another request. It selects from `shops` so that it
    // also writes nothing for a shop we hold no row for.
    try {
      const [row] = await db
        .insert(shopMembers)
        .select(
          db
            .select({
              id: sql<string>`${member.id}`.as("id"),
              shop: shops.shop,
              shopifyUserId: sql<string>`${member.shopifyUserId}`.as("shopify_user_id"),
              email: sql<string | null>`${member.email === null ? null : normalizeEmail(member.email)}`.as("email"),
              name: sql<string | null>`${member.name}`.as("name"),
              role: sql<"owner">`'owner'`.as("role"),
              status: sql<"active">`'active'`.as("status"),
              accountOwner: sql<boolean>`${member.accountOwner ? 1 : 0}`.as("account_owner"),
              collaborator: sql<boolean>`${member.collaborator ? 1 : 0}`.as("collaborator"),
              invitedBy: sql<string | null>`null`.as("invited_by"),
              createdAt: sql<number>`${member.now}`.as("created_at"),
              updatedAt: sql<number>`${member.now}`.as("updated_at"),
              lastSeenAt: sql<number | null>`${member.now}`.as("last_seen_at"),
            })
            .from(shops)
            .where(and(eq(shops.shop, shop), noOwner)),
        )
        .returning();
      return row === undefined ? undefined : toMember(row);
    } catch (error) {
      // The same Shopify user already has a row: a parallel request created it first.
      if (isUniqueViolation(error)) return undefined;
      throw error;
    }
  }

  async create(shop: string, member: NewMember, cap: SeatCap): Promise<CreateOutcome> {
    const db = getDb();
    // ONE statement, like the owner's: the seat is counted and taken together. It selects from `shops`, so it writes
    // nothing for a shop we hold no row for; a user who already has a row conflicts and writes nothing either.
    const [row] = await db
      .insert(shopMembers)
      .select(
        db
          .select({
            id: sql<string>`${member.id}`.as("id"),
            shop: shops.shop,
            shopifyUserId: sql<string>`${member.shopifyUserId}`.as("shopify_user_id"),
            email: sql<string | null>`${member.email === null ? null : normalizeEmail(member.email)}`.as("email"),
            name: sql<string | null>`${member.name}`.as("name"),
            role: sql<MemberRole>`${member.role}`.as("role"),
            status: statusFor(shop, member.status, cap).as("status"),
            accountOwner: sql<boolean>`${member.accountOwner ? 1 : 0}`.as("account_owner"),
            collaborator: sql<boolean>`${member.collaborator ? 1 : 0}`.as("collaborator"),
            invitedBy: sql<string | null>`null`.as("invited_by"),
            createdAt: sql<number>`${member.now}`.as("created_at"),
            updatedAt: sql<number>`${member.now}`.as("updated_at"),
            lastSeenAt: sql<number | null>`${member.now}`.as("last_seen_at"),
          })
          .from(shops)
          .where(eq(shops.shop, shop)),
      )
      .onConflictDoNothing()
      .returning();
    return row === undefined ? { kind: "exists" } : { kind: "created", member: toMember(row) };
  }

  async createInvite(shop: string, invite: { id: string; email: string; role: MemberRole; invitedBy: string; now: number }): Promise<Member> {
    const [row] = await getDb()
      .insert(shopMembers)
      .values({
        id: invite.id,
        shop,
        shopifyUserId: null,
        email: normalizeEmail(invite.email),
        role: invite.role,
        status: "invited",
        invitedBy: invite.invitedBy,
        createdAt: invite.now,
        updatedAt: invite.now,
      })
      .returning();
    if (!row) throw new Error("invitation insert returned no row");
    return toMember(row);
  }

  async acceptInvite(shop: string, inviteId: string, link: { shopifyUserId: string; profile: MemberProfile; now: number }, cap: SeatCap): Promise<Member | undefined> {
    try {
      const [row] = await getDb()
        .update(shopMembers)
        .set({
          shopifyUserId: link.shopifyUserId,
          status: statusFor(shop, "active", cap),
          // The invited address was written by a person; Shopify's verified one wins once it is known.
          ...(link.profile.email === null ? {} : { email: normalizeEmail(link.profile.email) }),
          ...(link.profile.name === null ? {} : { name: link.profile.name }),
          accountOwner: link.profile.accountOwner,
          collaborator: link.profile.collaborator,
          updatedAt: link.now,
          lastSeenAt: link.now,
        })
        .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, inviteId), eq(shopMembers.status, "invited"), isNull(shopMembers.shopifyUserId)))
        .returning();
      return row === undefined ? undefined : toMember(row);
    } catch (error) {
      // This Shopify user got a membership in the meantime; the caller reads it again.
      if (isUniqueViolation(error)) return undefined;
      throw error;
    }
  }

  async restoreOwner(shop: string, id: string, profile: MemberProfile, now: number): Promise<Member | undefined> {
    const [row] = await getDb()
      .update(shopMembers)
      .set({
        role: "owner",
        status: "active",
        ...(profile.email === null ? {} : { email: normalizeEmail(profile.email) }),
        ...(profile.name === null ? {} : { name: profile.name }),
        accountOwner: profile.accountOwner,
        collaborator: profile.collaborator,
        updatedAt: now,
        lastSeenAt: now,
      })
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id)))
      .returning();
    return row === undefined ? undefined : toMember(row);
  }

  async activate(shop: string, id: string, input: { from: readonly MemberStatus[]; role: MemberRole; cap: SeatCap; now: number }): Promise<Member | undefined> {
    const [row] = await getDb()
      .update(shopMembers)
      .set({ status: "active", role: input.role, updatedAt: input.now })
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id), inArray(shopMembers.status, [...input.from]), hasSeat(shop, input.cap)))
      .returning();
    return row === undefined ? undefined : toMember(row);
  }

  async setRole(shop: string, id: string, role: MemberRole, now: number): Promise<Member | undefined> {
    const [row] = await getDb()
      .update(shopMembers)
      .set({ role, updatedAt: now })
      // Staying an owner needs no guard; anything else must not take the last active owner's role.
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id), role === "owner" ? undefined : notLastOwner(shop)))
      .returning();
    return row === undefined ? undefined : toMember(row);
  }

  async remove(shop: string, id: string, now: number): Promise<Member | undefined> {
    const [row] = await getDb()
      .update(shopMembers)
      .set({ status: "removed", updatedAt: now })
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id), ne(shopMembers.status, "removed"), notLastOwner(shop)))
      .returning();
    return row === undefined ? undefined : toMember(row);
  }

  async recordSeen(shop: string, id: string, profile: MemberProfile, now: number): Promise<void> {
    await getDb()
      .update(shopMembers)
      .set({
        ...(profile.email === null ? {} : { email: normalizeEmail(profile.email) }),
        ...(profile.name === null ? {} : { name: profile.name }),
        accountOwner: profile.accountOwner,
        collaborator: profile.collaborator,
        lastSeenAt: now,
      })
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id)));
  }
}
