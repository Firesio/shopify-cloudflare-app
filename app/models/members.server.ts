import { and, eq, gt, inArray, isNotNull, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { shopMembers, shops, type ShopMemberRow } from "~/db/schema";
import { isMemberRole, type MemberPermission, type MemberRole } from "~/domain/member-access";
import { heldBy, readStoredPermissions, serializePermissions } from "~/domain/member-permissions";
import { shopLog } from "~/observability/shop-log";
import { isMemberStatus, type MemberStatus } from "~/domain/member-lifecycle";
import type { CreateOutcome, Member, MemberProfile, MemberStore, NewMember, SeatCap, StatusCounts } from "~/ports/members";
import { getDb } from "~/request-context.server";
import { MANAGER_ROLES, activeMembers, hasSeat, notLastManager, notLastOwner, statusFor } from "./member-guards.server";

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
  const stored = readStoredPermissions(row.permissions);
  // A degraded read is reported, by shop hash and with nothing of the value: it reads as an empty set, so someone loses access.
  if (stored.kind === "damaged") void shopLog("member.permissions_damaged", row.shop);
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
    permissions: heldBy(stored),
  };
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** The shops a seat-overage scan may reach: installed or installed again, never one that uninstalled or was deactivated. */
const OPERATIONAL_STATUSES = ["INSTALLED", "REACTIVATED"] as const;

/** A shop's team is read whole, up to this many rows. The page counts the rest (`countByStatus`) and says so when it hit the cap. */
const TEAM_LIMIT = 500;

/**
 * A row that is a cancelled invitation from before cancelling one deleted it: removed, and no Shopify user was ever linked.
 * Nobody is behind it, so it is not on the team and can never be brought back (`activate` refuses a row with no user).
 */
const notCancelledInvitation = or(ne(shopMembers.status, "removed"), isNotNull(shopMembers.shopifyUserId));

/** D1 reports a unique-index violation only in the message; anything else is a real failure and is not hidden. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(`${error.message} ${String(error.cause ?? "")}`);
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

  async findWithInviter(shop: string, id: string): Promise<{ member: Member; inviter: Pick<Member, "name" | "email"> | undefined } | undefined> {
    const inviter = alias(shopMembers, "inviter");
    const found = await getDb()
      .select({ member: shopMembers, inviterId: inviter.id, inviterName: inviter.name, inviterEmail: inviter.email })
      .from(shopMembers)
      // The inviter is joined within the SAME shop: a forged `invited_by` can never name another shop's member.
      .leftJoin(inviter, and(eq(inviter.shop, shopMembers.shop), eq(inviter.id, shopMembers.invitedBy)))
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id)))
      .get();
    if (found === undefined) return undefined;
    return { member: toMember(found.member), inviter: found.inviterId === null ? undefined : { name: found.inviterName, email: found.inviterEmail } };
  }

  async list(shop: string): Promise<readonly Member[]> {
    // Bounded: a store's team is people, and a page must never grow with a runaway table.
    const rows = await getDb().select().from(shopMembers).where(and(eq(shopMembers.shop, shop), notCancelledInvitation)).orderBy(shopMembers.createdAt, shopMembers.id).limit(TEAM_LIMIT);
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

  async countByStatus(shop: string): Promise<StatusCounts> {
    // `count(trimmed_at)` counts the rows that have a value: among the `pending` ones, those that lost their seat.
    const rows = await getDb()
      .select({ status: shopMembers.status, n: sql<number>`count(*)`, trimmed: sql<number>`count(${shopMembers.trimmedAt})` })
      .from(shopMembers)
      .where(and(eq(shopMembers.shop, shop), notCancelledInvitation))
      .groupBy(shopMembers.status);
    const counts: Record<MemberStatus, number> = { invited: 0, pending: 0, active: 0, removed: 0 };
    let noSeat = 0;
    for (const row of rows) {
      const status = statusOf(row.status);
      counts[status] += Number(row.n);
      if (status === "pending") noSeat += Number(row.trimmed);
    }
    return { ...counts, noSeat };
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
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id), inArray(shopMembers.status, [...input.from]), isNotNull(shopMembers.shopifyUserId), hasSeat(shop, input.cap)))
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

  async setPermissions(shop: string, id: string, permissions: readonly MemberPermission[], now: number, role?: MemberRole): Promise<Member | undefined> {
    const [row] = await getDb()
      .update(shopMembers)
      .set({ permissions: serializePermissions(permissions), ...(role === undefined ? {} : { role }), updatedAt: now })
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
      // A row with no Shopify user is an invitation: it is cancelled (`cancelInvite`), never parked as a removed member.
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id), ne(shopMembers.status, "removed"), isNotNull(shopMembers.shopifyUserId), notLastOwner(shop), notLastManager(shop)))
      .returning();
    return row === undefined ? undefined : toMember(row);
  }

  async cancelInvite(shop: string, id: string): Promise<Member | undefined> {
    // Deleted, not marked: an invitation has no person behind it, holds no seat and nothing refers to it (an invitation has
    // no Shopify user, so it cannot have invited anyone). A removed copy would only be a row that could never be restored.
    const [row] = await getDb()
      .delete(shopMembers)
      .where(and(eq(shopMembers.shop, shop), eq(shopMembers.id, id), eq(shopMembers.status, "invited"), isNull(shopMembers.shopifyUserId)))
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
