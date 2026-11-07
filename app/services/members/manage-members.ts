import { can, canAssignRole, grantsOf, type MemberRole } from "~/domain/member-access";
import { canTransition } from "~/domain/member-lifecycle";
import { checkCustomPermissions, type CustomPermissionPolicy, type PermissionFailure } from "~/domain/member-permissions";
import { seatCapOf } from "~/domain/member-seats";
import { err, ok, type Result } from "~/lib/result";
import type { Member, MemberStore } from "~/ports/members";
import type { MemberSeats } from "~/ports/member-seats";
import type { Runtime } from "~/ports/runtime";
import type { MemberLogEntry } from "./resolve-member";

/**
 * What a member with `members:manage` can do to the team: change a role, remove someone (or cancel an invitation), let a
 * waiting person in, bring a removed one back. Each is one use case over the same guards, so no route can forget one.
 *
 *   forbidden      the actor lacks `members:manage`, or would be handing out or touching a role they may not (an owner
 *                  is made and touched only by an owner: `canAssignRole`)
 *   notFound       no such member in this shop
 *   notYourself    nobody changes or removes their own membership here: a mistake would lock them out, and an owner who
 *                  wants out asks another owner
 *   lastOwner      it would take the shop's last active owner out of that role
 *   lastManager    it would leave the shop with nobody who can manage the team (`members:manage`)
 *   noSeat         the plan has no free seat for another active member
 *   invalidState   the member is not in a state this applies to, or someone else changed them first
 */
export type ManageFailure = "forbidden" | "notFound" | "notYourself" | "lastOwner" | "lastManager" | "noSeat" | "invalidState";

/**
 * What `setMemberPermissions` can refuse: everything above that applies, and
 *
 *   customUnavailable   the app does not let merchants give a member a set of their own
 *   ownerFixed          an owner and the store's own owner always hold everything: they have no set
 *   permissionInvalid   a name that is not a permission, or a set without the way in
 *   cannotGrant         a permission the actor lacks, or one that only comes with a role
 */
export type PermissionsFailure = ManageFailure | PermissionFailure | "customUnavailable" | "ownerFixed";

export interface ManageDependencies {
  readonly members: MemberStore;
  readonly seats: MemberSeats;
  /** Whether merchants may give a member a set of their own, and what only comes with a role. The app's choice. */
  readonly customPermissions: CustomPermissionPolicy;
  readonly runtime: Pick<Runtime, "clock">;
  readonly log: (entry: MemberLogEntry) => void | Promise<void>;
}

/**
 * Who is acting: enough to check what they may do. `permissions` is the actor's own set when they have one; a bare
 * `{ id, shop, role }` is someone on their role's preset, which is what a test says in the fewest words.
 */
export type Actor = Pick<Member, "id" | "shop" | "role"> & Partial<Pick<Member, "permissions">>;

/** The member to act on, checked against everything that does not depend on what the action is. */
async function target(actor: Actor, targetId: string, deps: ManageDependencies): Promise<Result<Member, ManageFailure>> {
  if (!can(actor, "members:manage")) return err("forbidden");
  const member = await deps.members.findById(actor.shop, targetId);
  if (!member) return err("notFound");
  if (member.id === actor.id) return err("notYourself");
  // Nobody touches a member whose role they could not hand out themselves; for an owner that means only an owner.
  if (!canAssignRole(actor, member.role)) return err("forbidden");
  return ok(member);
}

/** After a refused write: read the member again to say why. Gone or moved on is `invalidState`, otherwise the guard that fired. */
async function whyRefused(actor: Actor, before: Member, expected: "role" | "removal", deps: ManageDependencies): Promise<ManageFailure> {
  const now = await deps.members.findById(actor.shop, before.id);
  if (!now) return "notFound";
  if (expected === "removal" && now.status === "removed") return "invalidState";
  if (now.status !== "active") return "invalidState";
  // An owner who is refused is the last owner (while there are two, there are two managers too). Otherwise only the
  // last-manager guard can have fired, and it names a role that holds `members:manage`.
  if (now.role === "owner") return "lastOwner";
  return can(now, "members:manage") ? "lastManager" : "invalidState";
}

export async function changeRole(input: { actor: Actor; targetId: string; role: MemberRole }, deps: ManageDependencies): Promise<Result<Member, ManageFailure>> {
  const found = await target(input.actor, input.targetId, deps);
  if (!found.ok) return found;
  const member = found.value;
  if (!canAssignRole(input.actor, input.role)) return err("forbidden");
  if (member.status === "removed") return err("invalidState");
  // Choosing the role a member with a set of their own was based on still applies its preset, which drops the set.
  if (member.role === input.role && member.permissions === null) return ok(member);

  const changed = await deps.members.setRole(input.actor.shop, member.id, input.role, deps.runtime.clock.now());
  if (!changed) return err(await whyRefused(input.actor, member, "role", deps));
  await deps.log({ event: "member.role_changed", shop: input.actor.shop, role: changed.role, by: input.actor.id });
  return ok(changed);
}

/** Removes a member, or cancels an invitation that nobody has taken up. The last active owner and the last active manager stay. */
export async function removeMember(input: { actor: Actor; targetId: string }, deps: ManageDependencies): Promise<Result<Member, ManageFailure>> {
  const found = await target(input.actor, input.targetId, deps);
  if (!found.ok) return found;
  const member = found.value;
  if (!canTransition(member.status, "removed")) return err("invalidState");

  const removed = await deps.members.remove(input.actor.shop, member.id, deps.runtime.clock.now());
  if (!removed) return err(await whyRefused(input.actor, member, "removal", deps));
  await deps.log({ event: "member.removed", shop: input.actor.shop, role: removed.role, by: input.actor.id });
  return ok(removed);
}

/** Lets a waiting person in with the role chosen, if the plan has a seat. */
export async function approveMember(input: { actor: Actor; targetId: string; role: MemberRole }, deps: ManageDependencies): Promise<Result<Member, ManageFailure>> {
  return activate(input, "pending", "member.approved", deps);
}

/** Brings a removed member back, with the role chosen, if the plan has a seat. */
export async function restoreMember(input: { actor: Actor; targetId: string; role: MemberRole }, deps: ManageDependencies): Promise<Result<Member, ManageFailure>> {
  return activate(input, "removed", "member.restored", deps);
}

async function activate(
  input: { actor: Actor; targetId: string; role: MemberRole },
  from: "pending" | "removed",
  event: "member.approved" | "member.restored",
  deps: ManageDependencies,
): Promise<Result<Member, ManageFailure>> {
  const found = await target(input.actor, input.targetId, deps);
  if (!found.ok) return found;
  const member = found.value;
  if (!canAssignRole(input.actor, input.role)) return err("forbidden");
  if (member.status !== from || !canTransition(member.status, "active")) return err("invalidState");

  const cap = seatCapOf(await deps.seats.limit(input.actor.shop));
  const activated = await deps.members.activate(input.actor.shop, member.id, { from: [from], role: input.role, cap, now: deps.runtime.clock.now() });
  if (!activated) {
    // Either someone moved them on, or there was no seat: read again to tell.
    const now = await deps.members.findById(input.actor.shop, member.id);
    return err(now?.status === from ? "noSeat" : now ? "invalidState" : "notFound");
  }
  await deps.log({ event, shop: input.actor.shop, role: activated.role, by: input.actor.id });
  return ok(activated);
}

/** After a refused write of a set: read the member again to say why. Only the last-manager guard is left once the rest still holds. */
async function whyPermissionsRefused(actor: Actor, before: Member, deps: ManageDependencies): Promise<PermissionsFailure> {
  const now = await deps.members.findById(actor.shop, before.id);
  if (!now) return "notFound";
  if (now.status !== "active") return "invalidState";
  if (now.role === "owner" || now.accountOwner) return "ownerFixed";
  return "lastManager";
}

/** `list` as the one string a log line carries: the names of permissions are not personal data. */
const namesOf = (list: readonly string[]): string => list.join(",");

/**
 * Gives an active member a set of permissions of their own, for an app that lets merchants choose what each person can do.
 * The role they were based on stays unless one is named (the page does, with the set); choosing a role later drops the set. Refused when the app does not allow it, for an
 * owner or the store's own owner, for someone who is not active, and for a set the actor may not give
 * (`checkCustomPermissions`). The log says what was added and taken away against what the member held before.
 */
export async function setMemberPermissions(
  input: { actor: Actor; targetId: string; permissions: readonly string[]; role?: MemberRole },
  deps: ManageDependencies,
): Promise<Result<Member, PermissionsFailure>> {
  if (!deps.customPermissions.enabled) return err("customUnavailable");
  const found = await target(input.actor, input.targetId, deps);
  if (!found.ok) return found;
  const member = found.value;
  // The role the set is based on is handed out like any role, and an owner has no set to be based on.
  if (input.role !== undefined && !canAssignRole(input.actor, input.role)) return err("forbidden");
  if (member.role === "owner" || member.accountOwner || input.role === "owner") return err("ownerFixed");
  if (member.status !== "active") return err("invalidState");
  const checked = checkCustomPermissions(input.actor, input.permissions, deps.customPermissions);
  if (!checked.ok) return err(checked.reason);

  const before = grantsOf(member);
  const changed = await deps.members.setPermissions(input.actor.shop, member.id, checked.value, deps.runtime.clock.now(), input.role);
  if (!changed) return err(await whyPermissionsRefused(input.actor, member, deps));
  await deps.log({
    event: "member.permissions_changed",
    shop: input.actor.shop,
    role: changed.role,
    by: input.actor.id,
    granted: namesOf(checked.value.filter((permission) => !before.includes(permission))),
    revoked: namesOf(before.filter((permission) => !checked.value.includes(permission))),
  });
  return ok(changed);
}
