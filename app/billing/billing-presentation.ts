import type { Money } from "~/money";
import { dateOnlyInstant, type BillingStatus, type SubscriptionPhase } from "./subscription-status";

/**
 * What the billing page decides to SAY about a subscription, as data. The route turns these into translated,
 * formatted text; nothing here knows about a language or a time zone, so every branch is provable without a render.
 */
type Subscribed = Extract<BillingStatus, { kind: "subscribed" }>;

/** The one sentence under the plan name, or none. Dates are carried raw: the route formats them. */
export type StatusLine =
  | { readonly kind: "trial"; readonly endsAt: number; readonly price: Money | null }
  | { readonly kind: "renews"; readonly at: number; readonly price: Money | null }
  /** `instant` is midnight UTC of a calendar date: format it with the `UTC` zone, never the shop's. */
  | { readonly kind: "cancelsOn"; readonly instant: number }
  | { readonly kind: "cancelsAtPeriodEnd" }
  | { readonly kind: "frozen" }
  | { readonly kind: "pending" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "inactive" };

function activeLine(status: Subscribed): StatusLine | null {
  if (status.trialEndsAt !== null) return { kind: "trial", endsAt: status.trialEndsAt, price: status.price };
  // No date means no renewal line: a made-up "renews today" would be a lie.
  if (status.currentPeriodEndsAt === null) return null;
  return { kind: "renews", at: status.currentPeriodEndsAt, price: status.price };
}

function cancellingLine(status: Subscribed): StatusLine {
  const instant = dateOnlyInstant(status.cancelsOn);
  return instant === null ? { kind: "cancelsAtPeriodEnd" } : { kind: "cancelsOn", instant };
}

const LINE_FOR_PHASE: Readonly<Record<SubscriptionPhase, (status: Subscribed) => StatusLine | null>> = {
  active: activeLine,
  cancelling: cancellingLine,
  frozen: () => ({ kind: "frozen" }),
  pending: () => ({ kind: "pending" }),
  cancelled: () => ({ kind: "cancelled" }),
  inactive: () => ({ kind: "inactive" }),
};

export function statusLine(status: BillingStatus): StatusLine | null {
  return status.kind === "free" ? null : LINE_FOR_PHASE[status.phase](status);
}

/** The label on the page's one button. */
export type PlanActionKind = "upgrade" | "manage" | "review" | "resubscribe" | "choose";

const ACTION_FOR_PHASE: Readonly<Record<SubscriptionPhase, PlanActionKind>> = {
  active: "manage",
  cancelling: "manage",
  // A frozen charge is resolved by the hosted plan page, which is where "Manage plan" goes.
  frozen: "manage",
  pending: "review",
  cancelled: "resubscribe",
  inactive: "choose",
};

export function planActionKind(status: BillingStatus): PlanActionKind {
  return status.kind === "free" ? "upgrade" : ACTION_FOR_PHASE[status.phase];
}

export type PhaseTone = "success" | "warning" | "critical" | "neutral";

/** The badge next to the plan name. */
export const PHASE_TONE: Readonly<Record<SubscriptionPhase, PhaseTone>> = {
  active: "success",
  cancelling: "warning",
  frozen: "critical",
  pending: "warning",
  cancelled: "neutral",
  inactive: "neutral",
};
