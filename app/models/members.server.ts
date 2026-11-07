import { and, eq, gt, inArray, isNotNull, isNull, ne, notExists, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { shopMembers, shops, type ShopMemberRow } from "~/db/schema";
import { isMemberRole, rolesHolding, type MemberPermission, type MemberRole } from "~/domain/member-access";
import { parseStoredPermissions, serializePermissions } from "~/domain/member-permissions";
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
    trimmedAt: row.trimmedAt,
    permissions: parseStoredPermissions(row.permissions),
  };
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** The shops a seat-overage scan may reach: installed or installed again, never one that uninstalled or was deactivated. */
const OPERATIONAL_STATUSES = ["INSTALLED", "REACTIVATED"] as const;

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

/** The roles that may manage the team: the last active member holding one of them can neither be demoted out of it nor removed. */
const MANAGER_ROLES: readonly MemberRole[] = rolesHolding("members:manage");

/**
 * A manager is an active member on a manager role's PRESET. Someone with a set of their own is never one, whatever role they
 * were based on: a set never holds `members:manage` (`ALWAYS_PROTECTED`), which is what lets the database decide this from
 * roles alone. Written once, for the member the statement is changing (`shopMembers`) and for the others it counts (`other`).
 */
function isManager(row: typeof shopMembers | typeof other): SQL {
  return and(inArray(row.role, [...MANAGER_ROLES]), isNull(row.permissions), eq(row.status, "active")) ?? sql`1 = 0`;
}

/** True when the member is NOT the shop's last active team manager: the second guard a demotion or removal needs. */
function notLastManager(shop: string): SQL {
  const managers = sql`${getDb().select({ n: sql`count(*)` }).from(other).where(and(eq(other.shop, shop), isManager(other)))}`;
  return sql`not (${isManager(shopMembers)} and ${managers} <= 1)`;
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
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.status, "active"), inArray(shopMembers.role, [...roles]), isNull(shopMembers.permissions)))
      .orderBy(shopMembers.createdAt, shopMembers.id)
      .limit(limit);
    return rows.map(toMember);
  }

  async listActive(shop: string): Promise<readonly Member[]> {
    const rows = await getDb()
      .select()
      .from(shopMembers)
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.status, "active")))
      .orderBy(shopMembers.createdAt, shopMembers.id)
      .limit(TEAM_LIMIT);
    return rows.map(toMember);
  }

  async listShopsWithSeveralActive(afterShop: string | null, limit: number): Promise<readonly string[]> {
    // Across shops on purpose (the cron's scan), bounded and in a stable order so a cursor can resume. A shop with one
    // active member cannot be over any limit a trim could act on.
    const rows = await getDb()
      .select({ shop: shopMembers.shop })
      .from(shopMembers)
      .innerJoin(shops, eq(shops.shop, shopMembers.shop))
      .where(and(eq(shopMembers.status, "active"), inArray(shops.relationshipStatus, [...OPERATIONAL_STATUSES]), afterShop === null ? undefined : gt(shopMembers.shop, afterShop)))
      .groupBy(shopMembers.shop)
      .having(gt(sql`count(*)`, 1))
      .orderBy(shopMembers.shop)
      .limit(limit);
    return rows.map((row) => row.shop);
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

  async hasOpenedApp(shop: string): Promise<boolean> {
    const row = await getDb()
      .select({ id: shopMembers.id })
      .from(shopMembers)
      .where(and(eq(shopMembers.shop, shop), isNotNull(shopMembers.shopifyUserId)))
      .limit(1)
      .get();
    return row !== undefined;
  }

  async createFirstMemberIfNone(shop: string, member: Omit<NewMember, "status">): Promise<Member | undefined> {
    const db = getDb();
    const nobodyOpened = notExists(
      db
        .select({ one: sql`1` })
        .from(shopMembers)
        .where(and(eq(shopMembers.shop, shop), isNotNull(shopMembers.shopifyUserId))),
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
              role: sql<MemberRole>`${member.role}`.as("role"),
              status: sql<"active">`'active'`.as("status"),
              accountOwner: sql<boolean>`${member.accountOwner ? 1 : 0}`.as("account_owner"),
              collaborator: sql<boolean>`${member.collaborator ? 1 : 0}`.as("collaborator"),
              invitedBy: sql<string | null>`null`.as("invited_by"),
              createdAt: sql<number>`${member.now}`.as("created_at"),
              updatedAt: sql<number>`${member.now}`.as("updated_at"),
              lastSeenAt: sql<number | null>`${member.now}`.as("last_seen_at"),
              trimmedAt: sql<number | null>`null`.as("trimmed_at"),
              permissions: sql<string | null>`null`.as("permissions"),
            })
            .from(shops)
            .where(and(eq(shops.shop, shop), nobodyOpened)),
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
            trimmedAt: sql<number | null>`null`.as("trimmed_at"),
            permissions: sql<string | null>`null`.as("permissions"),
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
        trimmedAt: null,
        permissions: null,
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
      .set({ status: "active", role: input.role, trimmedAt: null, permissions: null, updatedAt: input.now })
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id), inArray(shopMembers.status, [...input.from]), hasSeat(shop, input.cap)))
      .returning();
    return row === undefined ? undefined : toMember(row);
  }

  async setRole(shop: string, id: string, role: MemberRole, now: number): Promise<Member | undefined> {
    const [row] = await getDb()
      .update(shopMembers)
      .set({ role, permissions: null, updatedAt: now })
      // Becoming an owner needs no guard against losing the last owner, and a role that still manages the team none against
      // losing the last manager; anything else must not take the last active owner's role or the last manager's.
      .where(
        and(
          eq(shopMembers.shop, shop),
          eq(shopMembers.id, id),
          role === "owner" ? undefined : notLastOwner(shop),
          MANAGER_ROLES.includes(role) ? undefined : notLastManager(shop),
        ),
      )
      .returning();
    return row === undefined ? undefined : toMember(row);
  }

  async setPermissions(shop: string, id: string, permissions: readonly MemberPermission[], now: number): Promise<Member | undefined> {
    const [row] = await getDb()
      .update(shopMembers)
      .set({ permissions: serializePermissions(permissions), updatedAt: now })
      .where(
        and(
          eq(shopMembers.shop, shop),
          eq(shopMembers.id, id),
          eq(shopMembers.status, "active"),
          // An owner and the store's own owner hold everything: they have no set.
          ne(shopMembers.role, "owner"),
          eq(shopMembers.accountOwner, false),
          // A set never holds `members:manage`, so this takes a manager out of managing: not the last one.
          notLastManager(shop),
        ),
      )
      .returning();
    return row === undefined ? undefined : toMember(row);
  }

  async trim(shop: string, id: string, limit: number, now: number): Promise<Member | undefined> {
    const [row] = await getDb()
      .update(shopMembers)
      .set({ status: "pending", trimmedAt: now, updatedAt: now })
      .where(
        and(
          eq(shopMembers.shop, shop),
          eq(shopMembers.id, id),
          eq(shopMembers.status, "active"),
          // Never an owner, and never the person Shopify says owns the store: they come back as an owner on their next visit.
          ne(shopMembers.role, "owner"),
          eq(shopMembers.accountOwner, false),
          notLastManager(shop),
          // The count that justified this trim and the write are ONE statement: a second review cannot take a second seat.
          sql`${activeMembers(shop)} > ${limit}`,
        ),
      )
      .returning();
    return row === undefined ? undefined : toMember(row);
  }

  async remove(shop: string, id: string, now: number): Promise<Member | undefined> {
    const [row] = await getDb()
      .update(shopMembers)
      .set({ status: "removed", trimmedAt: null, permissions: null, updatedAt: now })
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id), ne(shopMembers.status, "removed"), notLastOwner(shop), notLastManager(shop)))
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
