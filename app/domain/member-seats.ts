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

/**
 * What the plan says, read for ONE purpose: deciding whether people who already hold a seat must lose it.
 *
 * `seatLimitFrom` is deliberately permissive in one direction (a refusal means "no NEW seats", limit 0, which only ever
 * keeps someone waiting). Trimming is the opposite: acting on a limit of 0 that was really a refusal would remove
 * everybody. So this reader is strict. It answers a number ONLY for an allowed capacity with a numeric maximum, and every
 * other answer is a reason NOT to trim:
 *
 *   limit       an allowed capacity with a whole-number maximum of 1 or more
 *   unlimited   an allowed capacity with no maximum: nothing to enforce (an open episode is cancelled)
 *   unknown     everything else: a refusal of any kind, an unknown feature, a key defined as another kind, a maximum that
 *               is not a whole number or is below 1 (a team always holds at least its owner, so a plan of 0 seats is a
 *               misdefined catalogue, not a limit). Nothing is trimmed on it.
 */
export type OverageLimit =
  | { readonly kind: "limit"; readonly maximum: number }
  | { readonly kind: "unlimited" }
  | { readonly kind: "unknown" };

export function overageLimitFrom(check: SeatCheck): OverageLimit {
  if (!check.allowed || check.kind !== "capacity") return { kind: "unknown" };
  if (check.maximum === undefined) return { kind: "unlimited" };
  return Number.isSafeInteger(check.maximum) && check.maximum >= 1 ? { kind: "limit", maximum: check.maximum } : { kind: "unknown" };
}

/** The strict limit as a plain number, or null for "do not trim". Never 0, whatever the answer was. */
export function trimmableLimitFrom(check: SeatCheck): number | null {
  const limit = overageLimitFrom(check);
  return limit.kind === "limit" ? limit.maximum : null;
}

/**
 * What the plan says, read for DISPLAY: how many seats the page may claim the plan has.
 *
 * `seatLimitFrom` turns every refusal into a limit of 0 so that nobody new is let in, which is right for admission and wrong
 * for words: a plan that could not be read would be shown as "3 of 0 seats, over the limit". This reading keeps the two
 * apart. It never changes what admission does; it only decides what the page may say.
 *
 *   limit      an allowed capacity with a maximum, or `disabled` (a plan that really grants no seats: a maximum of 0)
 *   unlimited  a capacity with no maximum, or a plan that never defined seats (`unknown_feature`)
 *   unknown    everything else: an inactive or unreadable subscription, an unknown plan, a key defined as another kind,
 *              a maximum that is not a whole number. The page says it cannot read the limit instead of inventing one.
 */
export type SeatReading =
  | { readonly kind: "limit"; readonly maximum: number }
  | { readonly kind: "unlimited" }
  | { readonly kind: "unknown" };

export function seatReadingFrom(check: SeatCheck): SeatReading {
  if (!check.allowed) {
    if (check.reason === "unknown_feature") return { kind: "unlimited" };
    return check.reason === "disabled" ? { kind: "limit", maximum: 0 } : { kind: "unknown" };
  }
  if (check.kind !== "capacity") return { kind: "unknown" };
  if (check.maximum === undefined) return { kind: "unlimited" };
  return Number.isSafeInteger(check.maximum) && check.maximum >= 0 ? { kind: "limit", maximum: check.maximum } : { kind: "unknown" };
}
