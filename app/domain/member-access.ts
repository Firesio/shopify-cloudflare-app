/**
 * What a MEMBER of a shop may do inside the app. PURE: no I/O, no clock, safe to import from the browser.
 *
 * A member is a person from the merchant's side (a Shopify staff user linked to the shop). Two closed vocabularies, both
 * static literal maps keyed by a union (@rules/design-patterns.md):
 *
 *   PERMISSION  one thing a person can do, `area:action`, described in words a merchant can read.
 *   ROLE        a named bundle of permissions. A member has exactly one role.
 *
 * This is about what the person may do in THIS APP. What they may do to the shop's Shopify data is Shopify's own
 * decision, made by the staff permissions the store owner set, and the app does not copy it here.
 *
 * Roles live in code, not in D1: a role is a product decision that ships with the code that checks it, and a permission
 * added in a deploy reaches the roles that should have it with no data migration. An app that needs merchant-defined
 * roles stores them beside this registry and passes them through the same `can()`.
 *
 * Extending, and what each costs:
 *   a permission   one entry in MEMBER_PERMISSIONS, then name it in the roles that get it. A route asks for it with
 *                  `guardMember`.
 *   a role         one entry in MEMBER_ROLES and one in ROLE_SPECS, and its name and description in the `admin`
 *                  catalogue. Nothing else changes.
 *
 * Stored values outlive the code that wrote them, so every function takes the role as a plain `string` and an unknown
 * or retired one holds NO permission: access fails closed.
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
 * `owner` is EVERYTHING by construction, so a permission added later reaches the one role that can always recover the
 * store's access. The narrower roles list what they hold, so a new permission reaches them only on purpose.
 */
export const ROLE_SPECS: Readonly<Record<MemberRole, RoleSpec>> = {
  owner: { permissions: MEMBER_PERMISSIONS },
  admin: { permissions: ["app:view", "app:manage", "members:manage"] },
  member: { permissions: ["app:view", "app:manage"] },
  viewer: { permissions: ["app:view"] },
};

/** A real guard, not `as MemberRole`: the value came from a column or a form. */
export function isMemberRole(value: string): value is MemberRole {
  return Object.prototype.hasOwnProperty.call(ROLE_SPECS, value);
}

/** Every permission a role holds. An unknown role holds none. */
export function permissionsOf(role: string): readonly MemberPermission[] {
  return isMemberRole(role) ? ROLE_SPECS[role].permissions : [];
}

export function can(role: string, permission: MemberPermission): boolean {
  return permissionsOf(role).includes(permission);
}

/**
 * May someone in `actorRole` hand out `role`? Only when they hold every permission it carries. Nobody can grant what
 * they lack, so a role that gains a permission later never becomes a way around the check.
 */
export function canAssignRole(actorRole: string, role: MemberRole): boolean {
  const held = permissionsOf(actorRole);
  return ROLE_SPECS[role].permissions.every((permission) => held.includes(permission));
}

/** The roles that hold a permission, in the order the roles are declared. For asking "who can do this?". */
export function rolesHolding(permission: MemberPermission): readonly MemberRole[] {
  return MEMBER_ROLES.filter((role) => ROLE_SPECS[role].permissions.includes(permission));
}

export function assignableRoles(actorRole: string): readonly MemberRole[] {
  return MEMBER_ROLES.filter((role) => canAssignRole(actorRole, role));
}
