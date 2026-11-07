import { err, ok, type Result } from "~/lib/result";
import { MEMBER_PERMISSIONS, can, grantsOf, type AccessSubject, type MemberPermission } from "./member-access";
import type { MemberStatus } from "./member-lifecycle";

/**
 * A member's own set of permissions, for the apps whose merchants choose what each person can do. PURE.
 *
 * The model, in one line: a member holds EITHER their role's preset OR a set of their own, never a difference from the
 * preset (`member-access.ts`). Giving someone a set copies nothing from the preset; the editor merely starts from it.
 * An app that does not want this leaves `customPermissions` off in `app/members/config.ts` and none of it can happen.
 *
 * Four rules hold whatever an app configures:
 *   - nobody gives what they do not hold;
 *   - the permission that manages the team is never given piecemeal: it comes with the Owner or Admin role only, because
 *     the rule "the shop always keeps someone who can manage the team" is decided by the database from roles alone;
 *   - an owner, and the person Shopify says owns the store, always hold everything: they have no set;
 *   - a set always includes the way in (`FLOOR_PERMISSION`). Someone who cannot even open the app is a seat that does
 *     nothing, and removing them is the way to say that.
 */

/** Without this a person cannot use the app at all, so every set carries it. */
export const FLOOR_PERMISSION: MemberPermission = "app:view";

/** Given only with a role, never piecemeal. The "last team manager" guard in `models/members.server.ts` rests on this. */
export const ALWAYS_PROTECTED: readonly MemberPermission[] = ["members:manage"];

/** The app's choice (`MEMBERS.customPermissions`) and what follows from it. */
export interface CustomPermissionPolicy {
  /** Merchants may give a member a set of their own. */
  readonly enabled: boolean;
  /** Permissions that can only come with a role: `ALWAYS_PROTECTED`, and whatever the app adds. */
  readonly protected: readonly MemberPermission[];
}

export function customPolicy(config: { readonly enabled: boolean; readonly alsoProtected: readonly MemberPermission[] }): CustomPermissionPolicy {
  return { enabled: config.enabled, protected: MEMBER_PERMISSIONS.filter((permission) => ALWAYS_PROTECTED.includes(permission) || config.alsoProtected.includes(permission)) };
}

const isPermission = (value: unknown): value is MemberPermission => typeof value === "string" && MEMBER_PERMISSIONS.some((permission) => permission === value);

/** The permissions named in `values`, once each, in the registry's order. Names that are not permissions are dropped. */
function inRegistryOrder(values: readonly unknown[]): readonly MemberPermission[] {
  return MEMBER_PERMISSIONS.filter((permission) => values.includes(permission));
}

/** What a stored `shop_members.permissions` value is: nothing (the role's preset), a set, or a value that is not a list. */
export type StoredPermissions =
  | { readonly kind: "preset" }
  | { readonly kind: "set"; readonly permissions: readonly MemberPermission[] }
  /** Not a list of names. The caller says so (a log line) and reads it as an empty set via `heldBy`. */
  | { readonly kind: "damaged" };

/**
 * A set as it was stored. No value is no set. A list is the permissions it names, once each in the registry's order, a name
 * the code no longer knows dropped. Anything else is `damaged`, which is a result and not an exception: the caller reports it.
 */
export function readStoredPermissions(raw: string | null): StoredPermissions {
  if (raw === null) return { kind: "preset" };
  const parsed = ((): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      // Not JSON at all: that is the `damaged` answer below, which the caller reports.
      return undefined;
    }
  })();
  return Array.isArray(parsed) ? { kind: "set", permissions: inRegistryOrder(parsed.filter(isPermission)) } : { kind: "damaged" };
}

/**
 * What a stored value makes a member hold: null for the preset, the set itself, and an EMPTY set for a damaged value, never
 * "no set": a damaged value must not hand back a preset that is wider than what someone chose.
 */
export function heldBy(stored: StoredPermissions): readonly MemberPermission[] | null {
  if (stored.kind === "preset") return null;
  return stored.kind === "set" ? stored.permissions : [];
}

/** What is written for a set: the names, in the registry's order. */
export function serializePermissions(permissions: readonly MemberPermission[]): string {
  return JSON.stringify(inRegistryOrder(permissions));
}

/** What `giver` may put in someone's set: what they hold themselves, without what is protected. */
export function grantableBy(giver: AccessSubject, policy: CustomPermissionPolicy): readonly MemberPermission[] {
  return grantsOf(giver).filter((permission) => !policy.protected.includes(permission));
}

export type PermissionFailure =
  /** A name that is not a permission, or a set without the way in. */
  | "permissionInvalid"
  /** A permission the giver lacks, or one that only comes with a role. */
  | "cannotGrant";

/**
 * The set `giver` asked for, checked: a clean list in the registry's order, or why not. A name that is not a permission is
 * said before one that may not be given, so a forged value is never mistaken for a policy refusal.
 */
export function checkCustomPermissions(giver: AccessSubject, requested: readonly string[], policy: CustomPermissionPolicy): Result<readonly MemberPermission[], PermissionFailure> {
  if (!requested.every(isPermission)) return err("permissionInvalid");
  const set = inRegistryOrder(requested);
  if (!set.includes(FLOOR_PERMISSION)) return err("permissionInvalid");
  if (!set.every((permission) => can(giver, permission) && !policy.protected.includes(permission))) return err("cannotGrant");
  return ok(set);
}

/** Whether a member can be given a set at all: the app allows it, and they are active, not an owner, not the store's owner. */
export function isCustomizable(target: { readonly role: string; readonly status: MemberStatus; readonly accountOwner: boolean }, policy: CustomPermissionPolicy): boolean {
  return policy.enabled && target.status === "active" && target.role !== "owner" && !target.accountOwner;
}
