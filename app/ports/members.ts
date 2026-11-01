import type { MemberRole } from "~/domain/member-access";
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

/** Every method takes `shop` first: a member id or an email from a request is attacker-controlled. */
export interface MemberStore {
  findByUserId(shop: string, shopifyUserId: string): Promise<Member | undefined>;
  findById(shop: string, id: string): Promise<Member | undefined>;
  /** An open invitation for this email (any case), if there is one. */
  findInviteByEmail(shop: string, email: string): Promise<Member | undefined>;
  /** Any membership for this email that is not removed, an open invitation included. */
  findOpenByEmail(shop: string, email: string): Promise<Member | undefined>;
  hasActiveOwner(shop: string): Promise<boolean>;
  /** The shop's team: people first (owners, then by name), invitations last. */
  list(shop: string): Promise<readonly Member[]>;
  /** Active members whose role is one of `roles` (the people to ask for access), oldest first, at most `limit`. */
  listWithRoles(shop: string, roles: readonly MemberRole[], limit: number): Promise<readonly Member[]>;
  /** How many members are in each status. */
  countByStatus(shop: string): Promise<Readonly<Record<MemberStatus, number>>>;
  /**
   * Adds an OWNER only if the shop has no active owner, in one statement, so two first requests cannot both become the
   * first owner. Undefined when the shop already has one (or has no `shops` row). Owners never wait for a seat.
   */
  createOwnerIfNone(shop: string, member: Omit<NewMember, "role" | "status">): Promise<Member | undefined>;
  /** Adds a member, `pending` instead of `active` when `cap` is already reached. Owners are added with `cap` null. */
  create(shop: string, member: NewMember, cap: SeatCap): Promise<CreateOutcome>;
  createInvite(shop: string, invite: { id: string; email: string; role: MemberRole; invitedBy: string; now: number }): Promise<Member>;
  /**
   * Links an open invitation to the Shopify user who opened the app. It becomes `active`, or `pending` when `cap` is
   * reached. Undefined when it was no longer open, or the user already has a membership.
   */
  acceptInvite(shop: string, inviteId: string, link: { shopifyUserId: string; profile: MemberProfile; now: number }, cap: SeatCap): Promise<Member | undefined>;
  /** Makes an existing member an active owner (the store's own owner, who cannot be locked out). Owners never wait for a seat. */
  restoreOwner(shop: string, id: string, profile: MemberProfile, now: number): Promise<Member | undefined>;
  /**
   * Makes a member `active` with `role`, only if they are in one of `from` and `cap` leaves a seat. Undefined otherwise;
   * the caller reads the member again to say which.
   */
  activate(shop: string, id: string, input: { from: readonly MemberStatus[]; role: MemberRole; cap: SeatCap; now: number }): Promise<Member | undefined>;
  /** Changes a role. Refused (undefined) when it would leave the shop without an active owner. */
  setRole(shop: string, id: string, role: MemberRole, now: number): Promise<Member | undefined>;
  /** Marks a member removed. Refused (undefined) when it would leave the shop without an active owner. */
  remove(shop: string, id: string, now: number): Promise<Member | undefined>;
  /** Keeps what Shopify says about the person, and when they were last seen. */
  recordSeen(shop: string, id: string, profile: MemberProfile, now: number): Promise<void>;
}
