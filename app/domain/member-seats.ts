/**
 * How many people a shop's plan lets into the app. PURE.
 *
 * A seat is an ACTIVE membership. The limit comes from the entitlement catalogue (`members.max`, a capacity), so the app
 * asks for a stable key and never compares plan handles. Whether the shop is within it is counted from the members table
 * in the same statement that adds someone (`SeatCap`), not by a second counter that could drift.
 *
 * Whether an app limits its team at all is the catalogue's say: `unlimited` on every plan is "no limit", and removing the
 * `members.max` key altogether is too.
 */
export const MEMBER_SEATS_KEY = "members.max";

export type SeatLimit = { readonly kind: "unlimited" } | { readonly kind: "limit"; readonly maximum: number };

/** The shape of the entitlement service's answer to `check`, which is all this reads. */
export type SeatCheck =
  | { readonly allowed: true; readonly kind: "capacity"; readonly maximum?: number }
  | { readonly allowed: true; readonly kind: "capability" | "quota" }
  | { readonly allowed: false; readonly reason: string };

/**
 * What the plan says, as a limit.
 *
 *   a capacity with a maximum        that maximum
 *   a capacity with none             unlimited
 *   `unknown_feature`                unlimited: this app never defined seats, so it does not limit them
 *   anything else that refuses       NO new seats (limit 0): `disabled` is a plan that grants none, and an inactive or
 *                                    unreadable subscription is not a reason to let people in. Members already active
 *                                    keep their access; only a NEW activation waits.
 *   a key defined as something other than a capacity   NO new seats: a misdefined catalogue must be noticed, not trusted
 */
export function seatLimitFrom(check: SeatCheck): SeatLimit {
  if (!check.allowed) return check.reason === "unknown_feature" ? { kind: "unlimited" } : { kind: "limit", maximum: 0 };
  if (check.kind !== "capacity") return { kind: "limit", maximum: 0 };
  return check.maximum === undefined ? { kind: "unlimited" } : { kind: "limit", maximum: check.maximum };
}

/** The cap a write is given: the maximum number of active members, or null for no limit. */
export function seatCapOf(limit: SeatLimit): number | null {
  return limit.kind === "unlimited" ? null : limit.maximum;
}

/** Seats still free given how many are taken, or null when there is no limit. Never negative: a plan can be downgraded below the team. */
export function seatsLeft(limit: SeatLimit, taken: number): number | null {
  return limit.kind === "unlimited" ? null : Math.max(0, limit.maximum - taken);
}
