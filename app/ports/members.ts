import type { MemberPermission, MemberRole } from "~/domain/member-access";
import type { MemberStatus } from "~/domain/member-lifecycle";

/** What the use cases need to read and change a shop's members. Implemented by `models/members.server.ts`. */

export interface Member {
  readonly id: string;
  readonly shop: string;
  /** Null while the row is only an invitation. */
  readonly shopifyUserId: string | null;
  readonly email: string | null;
  readonly name: string | null;
  readonly role: MemberRole;
  readonly status: MemberStatus;
  readonly accountOwner: boolean;
  readonly collaborator: boolean;
  readonly invitedBy: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastSeenAt: number | null;
  /** When a seat-overage trim took this person's seat; null otherwise. A `pending` member with it set has no seat, rather than waiting for approval. */
  readonly trimmedAt: number | null;
  /**
   * The member's own set of permissions, or null while they hold their role's preset. With a set, `role` is only what they
   * were based on: ask `can(member, permission)`, never the role. See `domain/member-permissions.ts`.
   */
  readonly permissions: readonly MemberPermission[] | null;
}

/** What Shopify told us about the person, kept on their row. */
export interface MemberProfile {
  readonly email: string | null;
  readonly name: string | null;
  readonly accountOwner: boolean;
  readonly collaborator: boolean;
}

export interface NewMember extends MemberProfile {
  readonly id: string;
  readonly shopifyUserId: string;
  readonly role: MemberRole;
  /** What the person should be. An `active` member only gets that while the shop has a free seat; otherwise `pending`. */
  readonly status: "active" | "pending";
  readonly now: number;
}

/**
 * The most ACTIVE members a shop may have, or null for no limit. Every write that makes someone active takes it and
 * checks it in the same statement that writes, so two requests cannot both take the last seat.
 */
export type SeatCap = number | null;

export type CreateOutcome =
  | { readonly kind: "created"; readonly member: Member }
  /** This Shopify user already has a membership in the shop (a parallel request got there first). */
  | { readonly kind: "exists" };

/** How many members are in each status, and how many of the `pending` ones lost their seat to a trim (`noSeat`) rather than wait for approval. */
export type StatusCounts = Readonly<Record<MemberStatus, number>> & { readonly noSeat: number };

/** Every method takes `shop` first: a member id or an email from a request is attacker-controlled. */
export interface MemberStore {
  findByUserId(shop: string, shopifyUserId: string): Promise<Member | undefined>;
  findById(shop: string, id: string): Promise<Member | undefined>;
  /**
   * One member of the shop with the name and address of whoever invited them, in ONE query. The inviter is looked up in the
   * same shop only; `inviter` is undefined when nobody invited them or that member is gone.
   */
  findWithInviter(shop: string, id: string): Promise<{ readonly member: Member; readonly inviter: Pick<Member, "name" | "email"> | undefined } | undefined>;
  /** An open invitation for this email (any case), if there is one. */
  findInviteByEmail(shop: string, email: string): Promise<Member | undefined>;
  /** Any membership for this email that is not removed, an open invitation included. */
  findOpenByEmail(shop: string, email: string): Promise<Member | undefined>;
  /**
   * Has anyone opened the app on this shop: is there a membership with a Shopify user, in ANY status? An invitation nobody
   * has taken up has no user and does not count.
   */
  hasOpenedApp(shop: string): Promise<boolean>;
  /** The shop's team: people first (owners, then by name), invitations last. */
  list(shop: string): Promise<readonly Member[]>;
  /**
   * Active members whose role is one of `roles` AND who hold that role's preset (the people to ask for access), oldest
   * first, at most `limit`. Someone with a set of their own is left out: their role is only what they were based on.
   */
  listWithRoles(shop: string, roles: readonly MemberRole[], limit: number): Promise<readonly Member[]>;
  /** Every ACTIVE member of the shop, oldest first, at most 500 (a team is people). For the seat-overage review. */
  listActive(shop: string): Promise<readonly Member[]>;
  /**
   * Shops (in alphabetical order, after `afterShop` when given) that have more than one active member and are installed,
   * at most `limit`: the only shops a seat limit could be over, for the cron's scan. Reads across shops on purpose.
   */
  listShopsWithSeveralActive(afterShop: string | null, limit: number): Promise<readonly string[]>;
  /** How many members are in each status (a cancelled invitation from before invitations were deleted is not counted). */
  countByStatus(shop: string): Promise<StatusCounts>;
  /**
   * Adds the shop's FIRST member, `active` with `member.role`, only if nobody has opened the app yet (no membership with
   * a Shopify user in any status), in one statement, so two first requests cannot both be first. Undefined when someone
   * has (or the shop has no `shops` row, or this user already has a row). The first member never waits for a seat.
   */
  createFirstMemberIfNone(shop: string, member: Omit<NewMember, "status">): Promise<Member | undefined>;
  /** Adds a member, `pending` instead of `active` when `cap` is already reached. Owners are added with `cap` null. */
  create(shop: string, member: NewMember, cap: SeatCap): Promise<CreateOutcome>;
  createInvite(shop: string, invite: { id: string; email: string; role: MemberRole; invitedBy: string; now: number }): Promise<Member>;
  /**
   * Links an open invitation to the Shopify user who opened the app. It becomes `active`, or `pending` when `cap` is
   * reached. Undefined when it was no longer open, or the user already has a membership.
   */
  acceptInvite(shop: string, inviteId: string, link: { shopifyUserId: string; profile: MemberProfile; now: number }, cap: SeatCap): Promise<Member | undefined>;
  /**
   * Makes an existing member an active owner (the store's own owner, who cannot be locked out). Owners never wait for a
   * seat, and never have a set of their own: any they had is dropped.
   */
  restoreOwner(shop: string, id: string, profile: MemberProfile, now: number): Promise<Member | undefined>;
  /**
   * Makes a member `active` with `role`, only if they are in one of `from` and `cap` leaves a seat. Undefined otherwise;
   * the caller reads the member again to say which. They start on the role's preset: any set they had is dropped. Refused
   * for a row with no Shopify user, in the same statement: an invitation is never made active by hand.
   */
  activate(shop: string, id: string, input: { from: readonly MemberStatus[]; role: MemberRole; cap: SeatCap; now: number }): Promise<Member | undefined>;
  /**
   * Changes a role, which applies the role's preset: a set the member had is dropped. Refused (undefined) when it would
   * take the last active owner's role, or the last active member who may manage the team (`members:manage`) out of a role
   * that holds it.
   */
  setRole(shop: string, id: string, role: MemberRole, now: number): Promise<Member | undefined>;
  /**
   * Gives an ACTIVE member a set of their own, replacing any they had. `role`, when given, is the role the set is based on and is
   * written in the same statement; without it the role stays as it was. ONE conditional statement,
   * refused (undefined) for a member who is not active, who is an owner or Shopify's account owner, or who is the shop's
   * last active team manager (a set never holds `members:manage`, so this takes them out of managing). The caller has
   * already checked what the set may contain (`checkCustomPermissions`).
   */
  setPermissions(shop: string, id: string, permissions: readonly MemberPermission[], now: number, role?: MemberRole): Promise<Member | undefined>;
  /**
   * Takes an active member's seat: they become `pending` and are marked trimmed. ONE conditional statement that writes
   * only if the member is still `active`, is not an owner or Shopify's account owner, is not the shop's last active member
   * who can manage the team, AND the shop's active count is still above `limit` in that same statement, so two reviews
   * that both want the last seat cannot take two. Undefined when any of that no longer holds.
   */
  trim(shop: string, id: string, limit: number, now: number): Promise<Member | undefined>;
  /**
   * Marks a member removed, and drops any set of their own. Refused (undefined) for the last active owner, for the last
   * active member who may manage the team, and for a row with no Shopify user (an invitation: `cancelInvite`).
   */
  remove(shop: string, id: string, now: number): Promise<Member | undefined>;
  /**
   * Cancels an invitation nobody has taken up by DELETING it: it has no person behind it and holds no seat. Undefined when the
   * row is not an open invitation of this shop (taken up in the meantime, already cancelled, or another shop's).
   */
  cancelInvite(shop: string, id: string): Promise<Member | undefined>;
  /** Keeps what Shopify says about the person, and when they were last seen. */
  recordSeen(shop: string, id: string, profile: MemberProfile, now: number): Promise<void>;
}
