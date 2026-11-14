import { createMemberSeats, checkOf, type SeatCheck } from "@firesio/members";
import { d1MemberStore } from "@firesio/members/d1";
import { entitlementOf } from "@firesio/plans";
import { MEMBERS } from "~/core/members";
import { PLANS, type PlanHandle } from "~/core/plans";

/** What the shop's plan says about seats, as the members library reads it: a number, no limit, or not in the plan. */
export function seatCheckOf(planHandle: PlanHandle): SeatCheck {
  const entitlement = entitlementOf(PLANS, planHandle, "members.max");
  if (entitlement === null || entitlement.kind === "disabled") return { allowed: false, reason: "disabled" };
  return entitlement.kind === "limit" ? checkOf(entitlement.max) : checkOf(null);
}

/**
 * Members (`@firesio/members`): who is on the shop's team. The `shops` table says which accounts are installed; the seat
 * limit is the plan's `members.max`, read through `effectivePlan`.
 */
export function memberServices(env: Env, effectivePlanHandle: (shop: string) => Promise<PlanHandle>) {
  const members = d1MemberStore(env.DB, MEMBERS, { accounts: { table: "shops", key: "shop", operational: { column: "relationship_status", values: ["INSTALLED", "REACTIVATED"] } } });
  const seats = createMemberSeats(async (shop) => seatCheckOf(await effectivePlanHandle(shop)));
  return { members, seats };
}
