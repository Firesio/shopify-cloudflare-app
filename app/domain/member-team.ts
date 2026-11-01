import { MEMBER_ROLES, assignableRoles, can, canAssignRole, type MemberRole } from "./member-access";
import { canTransition, type MemberStatus } from "./member-lifecycle";
import type { SeatLimit } from "./member-seats";

/**
 * A shop's team as the members page shows it. PURE: the rows, their order, and what the person looking may do to each.
 *
 * What a row offers is a courtesy, not the lock: every action is checked again where it happens (`manage-members`). It is
 * computed from the same rules, so a button never promises what the server would refuse.
 */

/** The parts of a member the views read. The Shopify user id is NOT among them: whether there is one is all they need. */
export interface TeamMember {
  readonly id: string;
  /** A Shopify user is linked to this membership. False for an invitation nobody has taken up. */
  readonly linked: boolean;
  readonly name: string | null;
  readonly email: string | null;
  readonly role: MemberRole;
  readonly status: MemberStatus;
  readonly accountOwner: boolean;
  readonly lastSeenAt: number | null;
}

export interface TeamRow {
  readonly id: string;
  /** The person's name, or null when Shopify has not told us one (the page words that in the reader's language). */
  readonly name: string | null;
  readonly email: string | null;
  readonly role: MemberRole;
  readonly status: MemberStatus;
  readonly isYou: boolean;
  readonly accountOwner: boolean;
  /** An invitation nobody has taken up: there is no person behind it yet. */
  readonly isInvitation: boolean;
  readonly lastSeenAt: number | null;
  /** What the person looking may offer for this row, and which roles they could give. */
  readonly can: {
    readonly changeRole: boolean;
    readonly remove: boolean;
    readonly approve: boolean;
    readonly restore: boolean;
  };
}

/** Waiting people first (they need an answer), then the team, then invitations, then those who were removed. */
const STATUS_ORDER: Readonly<Record<MemberStatus, number>> = { pending: 0, active: 1, invited: 2, removed: 3 };

function sortKey(member: Pick<TeamMember, "id" | "name" | "email">): string {
  return (member.name ?? member.email ?? member.id).toLowerCase();
}

/** A stored member as the views read it: the Shopify user id becomes "is there one", and nothing that is not shown comes along. */
export function toTeamMember(member: Omit<TeamMember, "linked"> & { readonly shopifyUserId: string | null }): TeamMember {
  return {
    id: member.id,
    linked: member.shopifyUserId !== null,
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.status,
    accountOwner: member.accountOwner,
    lastSeenAt: member.lastSeenAt,
  };
}

/** The team in the order every view shows it. Does not change the list it is given. */
export function orderTeam<T extends Pick<TeamMember, "id" | "name" | "email" | "role" | "status">>(members: readonly T[]): readonly T[] {
  return [...members].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      MEMBER_ROLES.indexOf(a.role) - MEMBER_ROLES.indexOf(b.role) ||
      sortKey(a).localeCompare(sortKey(b)) ||
      a.id.localeCompare(b.id),
  );
}

export function teamRows(actor: { readonly id: string; readonly role: string }, members: readonly TeamMember[]): readonly TeamRow[] {
  const manages = can(actor.role, "members:manage");
  return orderTeam(members)
    .map((member) => {
      const touchable = manages && member.id !== actor.id && canAssignRole(actor.role, member.role);
      return {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        status: member.status,
        isYou: member.id === actor.id,
        accountOwner: member.accountOwner,
        isInvitation: member.status === "invited" && !member.linked,
        lastSeenAt: member.lastSeenAt,
        can: {
          changeRole: touchable && member.status !== "removed",
          remove: touchable && canTransition(member.status, "removed"),
          approve: touchable && member.status === "pending",
          restore: touchable && member.status === "removed",
        },
      };
    });
}

/** The roles the person looking may hand to someone, in the order the roles are declared. */
export function rolesToOffer(actorRole: string): readonly MemberRole[] {
  return assignableRoles(actorRole);
}

/** Who a person who is kept out can ask: a name and an address, nothing else of the member. */
export interface TeamContact {
  readonly name: string | null;
  readonly email: string | null;
}

/** At most this many are shown: enough to reach someone, short enough to read. */
const CONTACT_LIMIT = 3;

/**
 * The people to ask for access: owners first, then admins, each by name and address. Someone with neither is no use to a
 * person who needs to reach them, so they are left out.
 */
export function contactsOf(managers: readonly Pick<TeamMember, "name" | "email" | "role">[]): readonly TeamContact[] {
  return [...managers]
    .filter((member) => member.name !== null || member.email !== null)
    .sort((a, b) => MEMBER_ROLES.indexOf(a.role) - MEMBER_ROLES.indexOf(b.role) || (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""))
    .slice(0, CONTACT_LIMIT)
    .map((member) => ({ name: member.name, email: member.email }));
}

export type SeatSummary =
  | { readonly kind: "unlimited" }
  | { readonly kind: "limit"; readonly maximum: number; readonly used: number; readonly left: number; readonly over: number };

/**
 * Seats for the page: used against the limit. `over` is how far the team is past it, which can happen after a downgrade
 * (a plan change never removes anyone); `left` is never negative.
 */
export function seatSummary(limit: SeatLimit, used: number): SeatSummary {
  if (limit.kind === "unlimited") return { kind: "unlimited" };
  return { kind: "limit", maximum: limit.maximum, used, left: Math.max(0, limit.maximum - used), over: Math.max(0, used - limit.maximum) };
}
