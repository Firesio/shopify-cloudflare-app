import { MEMBER_ROLES, assignableRoles, can, canAssignRole, grantsOf, type AccessSubject, type MemberPermission, type MemberRole } from "./member-access";
import { grantableBy, isCustomizable, type CustomPermissionPolicy } from "./member-permissions";
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
  /** A seat-overage trim took this person's seat: `pending` here means "no seat", not "waiting for approval". */
  readonly trimmed: boolean;
  /** They have a set of permissions of their own instead of a role's preset. The set itself is not a list's business. */
  readonly custom: boolean;
}

/** Who is looking: their id, and what they may do (their role, and their own set if they have one). */
type Viewer = { readonly id: string } & AccessSubject;

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
  /** Lost a seat to a seat-overage trim: shown as "no seat", and let back in the same way as someone waiting. */
  readonly noSeat: boolean;
  /** Holds a set of permissions of their own, so their role is only what they were based on. */
  readonly custom: boolean;
}

/** Waiting people first (they need an answer), then the team, then invitations, then those who were removed. */
const STATUS_ORDER: Readonly<Record<MemberStatus, number>> = { pending: 0, active: 1, invited: 2, removed: 3 };

function sortKey(member: Pick<TeamMember, "id" | "name" | "email">): string {
  return (member.name ?? member.email ?? member.id).toLowerCase();
}

/** A stored member as the views read it: the Shopify user id becomes "is there one", and nothing that is not shown comes along. */
export function toTeamMember(
  member: Omit<TeamMember, "linked" | "trimmed" | "custom"> & { readonly shopifyUserId: string | null; readonly trimmedAt: number | null; readonly permissions: readonly MemberPermission[] | null },
): TeamMember {
  return {
    id: member.id,
    linked: member.shopifyUserId !== null,
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.status,
    accountOwner: member.accountOwner,
    lastSeenAt: member.lastSeenAt,
    trimmed: member.trimmedAt !== null,
    custom: member.permissions !== null,
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

/** What the person looking may do to a member: change their role, remove them, let them in, bring them back. */
export interface RowActions {
  readonly changeRole: boolean;
  readonly remove: boolean;
  readonly approve: boolean;
  readonly restore: boolean;
}

/**
 * What `actor` may do to `member`. A courtesy, not the lock: the server asks the same rules again where the action happens
 * (`manage-members`), so the page never offers what it would refuse.
 */
function canOf(actor: Viewer, member: TeamMember): RowActions {
  const touchable = can(actor, "members:manage") && member.id !== actor.id && canAssignRole(actor, member.role);
  return {
    changeRole: touchable && member.status !== "removed",
    remove: touchable && canTransition(member.status, "removed"),
    approve: touchable && member.status === "pending",
    restore: touchable && member.status === "removed",
  };
}

/** One member as a row of the list: who they are and where they stand. Everything to do to them is on their own page. */
function rowOf(actor: Viewer, member: TeamMember): TeamRow {
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
    noSeat: member.status === "pending" && member.trimmed,
    custom: member.custom,
  };
}

export function teamRows(actor: Viewer, members: readonly TeamMember[]): readonly TeamRow[] {
  return orderTeam(members).map((member) => rowOf(actor, member));
}

/** A stored member with what only the detail page reads: whether they are a collaborator, when they joined, who invited them. */
type StoredMember = Parameters<typeof toTeamMember>[0] & { readonly collaborator: boolean; readonly createdAt: number };

/** One person as their own page shows it: their row, and the facts a list has no room for. */
export interface MemberDetail extends TeamRow {
  /** Shopify said this is a collaborator (an agency or freelancer), not staff of the store. */
  readonly collaborator: boolean;
  /** When the membership began: an invitation sent, or the first time they opened the app. */
  readonly createdAt: number;
  /** Who sent the invitation this membership began as; null when nobody did, or that member is gone. */
  readonly invitedBy: TeamContact | null;
  /** What they hold right now: their own set, or their role's preset. In the registry's order. */
  readonly permissions: readonly MemberPermission[];
  /**
   * Whether the person looking may give them a set of their own (the app allows it, they are active and not an owner, and the
   * looker may touch them), and which permissions the looker may tick. The server checks the same rules again.
   */
  readonly customize: { readonly allowed: boolean; readonly grantable: readonly MemberPermission[] };
  /** What the person looking may do to them: the page's acts, each checked again by the server. */
  readonly can: RowActions;
}

/**
 * The detail of one member. `inviter` is the member who sent their invitation, if there is one (the caller reads it in the
 * same shop); only a name and an address of them come along, never an id.
 */
export function memberDetail(actor: Viewer, member: StoredMember, inviter: Pick<TeamMember, "name" | "email"> | undefined, policy: CustomPermissionPolicy): MemberDetail {
  const asMember = toTeamMember(member);
  const actions = canOf(actor, asMember);
  return {
    ...rowOf(actor, asMember),
    can: actions,
    collaborator: member.collaborator,
    createdAt: member.createdAt,
    invitedBy: inviter === undefined ? null : { name: inviter.name, email: inviter.email },
    permissions: grantsOf(member),
    customize: { allowed: actions.changeRole && isCustomizable(member, policy), grantable: grantableBy(actor, policy) },
  };
}

/** The roles the person looking may hand to someone, in the order the roles are declared. */
export function rolesToOffer(actor: AccessSubject): readonly MemberRole[] {
  return assignableRoles(actor);
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
