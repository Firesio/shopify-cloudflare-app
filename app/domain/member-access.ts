/**
 * What a MEMBER of a shop may do inside the app. PURE: no I/O, no clock, safe to import from the browser.
 *
 * A member is a person from the merchant's side (a Shopify staff user linked to the shop). Two closed vocabularies, both
 * static literal maps keyed by a union (@rules/design-patterns.md):
 *
 *   PERMISSION  one thing a person can do, `area:action`, described in words a merchant can read.
 *   ROLE        a named bundle of permissions: a PRESET. A member has exactly one role.
 *
 * What a member holds is either their role's preset, read live from this file, or, in an app that lets merchants do it, a
 * set of their own (`member-permissions.ts`), in which case the role is only what they were based on. Never both, and
 * never a difference from the preset: a set is read whole, so what someone holds is always visible and never changes
 * because a preset did.
 *
 * This is about what the person may do in THIS APP. What they may do to the shop's Shopify data is Shopify's own
 * decision, made by the staff permissions the store owner set, and the app does not copy it here.
 *
 * Roles live in code, not in D1: a role is a product decision that ships with the code that checks it, and a permission
 * added in a deploy reaches the roles that should have it with no data migration. Someone with a set of their own does
 * not receive a permission added later: it is shown unchecked in their editor, and access fails closed.
 *
 * Extending, and what each costs:
 *   a permission   one entry in MEMBER_PERMISSIONS, then name it in the roles that get it. A route asks for it with
 *                  `guardMember`.
 *   a role         one entry in MEMBER_ROLES and one in ROLE_SPECS, and its name and description in the `admin`
 *                  catalogue. Nothing else changes.
 *
 * Stored values outlive the code that wrote them, so a role is read as a plain `string` and an unknown or retired one
 * holds NO permission: access fails closed.
 */

export const MEMBER_PERMISSIONS = ["app:view", "app:manage", "billing:manage", "members:manage"] as const;
export type MemberPermission = (typeof MEMBER_PERMISSIONS)[number];

export const MEMBER_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export interface RoleSpec {
  readonly permissions: readonly MemberPermission[];
}

/**
 * Keyed by the union, so a role cannot exist without a permission list.
 *
 * `owner` and `admin` are EVERYTHING by construction, so a permission added later reaches both. They differ in one
 * thing no permission expresses: only an owner can make or touch an owner (`canAssignRole`). The narrower roles list
 * what they hold, so a new permission reaches them only on purpose.
 */
export const ROLE_SPECS: Readonly<Record<MemberRole, RoleSpec>> = {
  owner: { permissions: MEMBER_PERMISSIONS },
  admin: { permissions: MEMBER_PERMISSIONS },
  member: { permissions: ["app:view", "app:manage"] },
  viewer: { permissions: ["app:view"] },
};

/** A real guard, not `as MemberRole`: the value came from a column or a form. */
export function isMemberRole(value: string): value is MemberRole {
  return Object.prototype.hasOwnProperty.call(ROLE_SPECS, value);
}

/** Every permission a role's PRESET holds. An unknown role holds none. Not what a member holds: that is `grantsOf`. */
export function presetOf(role: string): readonly MemberPermission[] {
  return isMemberRole(role) ? ROLE_SPECS[role].permissions : [];
}

/**
 * Who is asking, as far as permissions go: a member, or anything carrying their role and their own set. A member is
 * either on a role's preset (`permissions` is null, or absent on a value that is not a stored member) or has a set of
 * their own, in which case `role` is only what they were based on.
 *
 * Every question about what someone may do takes one of these and never a bare role, so a call site cannot read the
 * role of a member who has a set of their own and conclude the wrong thing.
 */
export interface AccessSubject {
  readonly role: string;
  readonly permissions?: readonly MemberPermission[] | null;
}

/** What someone holds right now: their own set when they have one (an empty one holds nothing), else their role's preset. */
export function grantsOf(subject: AccessSubject): readonly MemberPermission[] {
  return subject.permissions ?? presetOf(subject.role);
}

export function can(subject: AccessSubject, permission: MemberPermission): boolean {
  return grantsOf(subject).includes(permission);
}

/**
 * May `actor` hand out `role`, or touch a member who holds it? Two rules, both here so no caller can forget one:
 *
 *   - `owner` is held by Shopify's account owner or by someone an owner chose: only an owner may make, change, remove,
 *     approve or restore one. An admin holds every permission an owner does, so permissions alone cannot say this.
 *   - any other role only when the actor holds every permission it carries. Nobody can grant what they lack, so a role
 *     that gains a permission later never becomes a way around the check.
 */
export function canAssignRole(actor: AccessSubject, role: MemberRole): boolean {
  if (role === "owner" && actor.role !== "owner") return false;
  const held = grantsOf(actor);
  return ROLE_SPECS[role].permissions.every((permission) => held.includes(permission));
}

/**
 * The roles whose PRESET holds a permission, in the order the roles are declared. For asking "who can do this?" of members
 * who have no set of their own: someone with one is answered by `can`, never by their role.
 */
export function rolesHolding(permission: MemberPermission): readonly MemberRole[] {
  return MEMBER_ROLES.filter((role) => ROLE_SPECS[role].permissions.includes(permission));
}

export function assignableRoles(actor: AccessSubject): readonly MemberRole[] {
  return MEMBER_ROLES.filter((role) => canAssignRole(actor, role));
}
