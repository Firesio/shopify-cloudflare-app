import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { shopMembers } from "~/db/schema";
import { rolesHolding, type MemberRole } from "~/domain/member-access";
import type { MemberStatus } from "~/domain/member-lifecycle";
import type { SeatCap } from "~/ports/members";
import { getDb } from "~/request-context.server";

/**
 * The conditions a write to `shop_members` carries inside its own statement: the seat that is counted and taken together,
 * and the guards that keep the shop's last owner and last team manager. Kept apart from the repository, which is where
 * every query is, so that each rule is read once; nothing here queries on its own.
 */

/** The table seen from inside a subquery: the same name would otherwise shadow the row an UPDATE is changing. */
const other = alias(shopMembers, "other");

/** How many active members the shop has, as an expression for a statement to use. One statement sees one consistent count. */
export function activeMembers(shop: string): SQL {
  return sql`${getDb().select({ n: sql`count(*)` }).from(other).where(and(eq(other.shop, shop), eq(other.status, "active")))}`;
}

/** True while the cap leaves a seat. The count and the write that depends on it are ONE statement. */
export function hasSeat(shop: string, cap: SeatCap): SQL {
  return cap === null ? sql`1 = 1` : sql`${activeMembers(shop)} < ${cap}`;
}

/** `active` while there is a seat, `pending` otherwise; or `pending` outright when that is all that was asked for. */
export function statusFor(shop: string, wanted: "active" | "pending", cap: SeatCap): SQL<MemberStatus> {
  return wanted === "pending" ? sql<MemberStatus>`'pending'` : sql<MemberStatus>`case when ${hasSeat(shop, cap)} then 'active' else 'pending' end`;
}

/** True when the member is NOT the shop's last active owner: the condition a demotion or removal needs. */
export function notLastOwner(shop: string): SQL {
  const owners = sql`${getDb()
    .select({ n: sql`count(*)` })
    .from(other)
    .where(and(eq(other.shop, shop), eq(other.role, "owner"), eq(other.status, "active")))}`;
  return sql`not (${shopMembers.role} = 'owner' and ${shopMembers.status} = 'active' and ${owners} <= 1)`;
}

/** The roles that may manage the team: the last active member holding one of them can neither be demoted out of it nor removed. */
export const MANAGER_ROLES: readonly MemberRole[] = rolesHolding("members:manage");

/**
 * A manager is an active member on a manager role's PRESET. Someone with a set of their own is never one, whatever role they
 * were based on: a set never holds `members:manage` (`ALWAYS_PROTECTED`), which is what lets the database decide this from
 * roles alone. Written once, for the member the statement is changing (`shopMembers`) and for the others it counts (`other`).
 */
function isManager(row: typeof shopMembers | typeof other): SQL {
  return sql`${inArray(row.role, [...MANAGER_ROLES])} and ${isNull(row.permissions)} and ${eq(row.status, "active")}`;
}

/** True when the member is NOT the shop's last active team manager: the second guard a demotion or removal needs. */
export function notLastManager(shop: string): SQL {
  const managers = sql`${getDb().select({ n: sql`count(*)` }).from(other).where(and(eq(other.shop, shop), isManager(other)))}`;
  return sql`not (${isManager(shopMembers)} and ${managers} <= 1)`;
}

