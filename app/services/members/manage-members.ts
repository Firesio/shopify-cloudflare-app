import { can, canAssignRole, type MemberRole } from "~/domain/member-access";
import { canTransition } from "~/domain/member-lifecycle";
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
 *   forbidden      the actor lacks `members:manage`, or would be handing out or touching a role above their own
 *   notFound       no such member in this shop
 *   notYourself    nobody changes or removes their own membership here: a mistake would lock them out, and an owner who
 *                  wants out asks another owner
 *   lastOwner      it would leave the shop without an active owner
 *   noSeat         the plan has no free seat for another active member
 *   invalidState   the member is not in a state this applies to, or someone else changed them first
 */
export type ManageFailure = "forbidden" | "notFound" | "notYourself" | "lastOwner" | "noSeat" | "invalidState";

export interface ManageDependencies {
  readonly members: MemberStore;
  readonly seats: MemberSeats;
  readonly runtime: Pick<Runtime, "clock">;
  readonly log: (entry: MemberLogEntry) => void | Promise<void>;
}

/** Who is acting: enough to check what they may do. */
export type Actor = Pick<Member, "id" | "shop" | "role">;

/** The member to act on, checked against everything that does not depend on what the action is. */
async function target(actor: Actor, targetId: string, deps: ManageDependencies): Promise<Result<Member, ManageFailure>> {
  if (!can(actor.role, "members:manage")) return err("forbidden");
  const member = await deps.members.findById(actor.shop, targetId);
  if (!member) return err("notFound");
  if (member.id === actor.id) return err("notYourself");
  // Nobody touches a member whose role they could not hand out themselves.
  if (!canAssignRole(actor.role, member.role)) return err("forbidden");
  return ok(member);
}

/** After a refused write: read the member again to say why. Gone or moved on is `invalidState`, otherwise the guard that fired. */
async function whyRefused(actor: Actor, before: Member, expected: "role" | "removal", deps: ManageDependencies): Promise<ManageFailure> {
  const now = await deps.members.findById(actor.shop, before.id);
  if (!now) return "notFound";
  if (expected === "removal" && now.status === "removed") return "invalidState";
  return now.role === "owner" && now.status === "active" ? "lastOwner" : "invalidState";
}

export async function changeRole(input: { actor: Actor; targetId: string; role: MemberRole }, deps: ManageDependencies): Promise<Result<Member, ManageFailure>> {
  const found = await target(input.actor, input.targetId, deps);
  if (!found.ok) return found;
  const member = found.value;
  if (!canAssignRole(input.actor.role, input.role)) return err("forbidden");
  if (member.status === "removed") return err("invalidState");
  if (member.role === input.role) return ok(member);

  const changed = await deps.members.setRole(input.actor.shop, member.id, input.role, deps.runtime.clock.now());
  if (!changed) return err(await whyRefused(input.actor, member, "role", deps));
  await deps.log({ event: "member.role_changed", shop: input.actor.shop, role: changed.role, by: input.actor.id });
  return ok(changed);
}

/** Removes a member, or cancels an invitation that nobody has taken up. The last active owner cannot be removed. */
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
  if (!canAssignRole(input.actor.role, input.role)) return err("forbidden");
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
