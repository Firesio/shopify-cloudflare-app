import { fromMinorUnits, toCurrency, type Money } from "~/money";
import type { SubscriptionStatus } from "~/domain/subscription-lifecycle";

/**
 * What the billing page says about a subscription. One phase per thing a
 * merchant needs to be told differently, derived from Partner's
 * `SubscriptionStatusState` (the projection in `shop_subscriptions`):
 *
 * | Partner state            | Phase        | Paid access |
 * | ------------------------ | ------------ | ----------- |
 * | ACTIVE                   | `active`     | yes         |
 * | CANCELLATION_SCHEDULED   | `cancelling` | yes, until it ends |
 * | FROZEN                   | `frozen`     | no          |
 * | PENDING                  | `pending`    | no          |
 * | CANCELED                 | `cancelled`  | no          |
 * | UNKNOWN                  | `inactive`   | no          |
 *
 * "Paid access" must agree with `resolveEffectivePlan` (`~/domain/plan-hierarchy`),
 * which treats only ACTIVE and CANCELLATION_SCHEDULED as paid: a test holds the
 * two together for every status.
 */
export type SubscriptionPhase = "active" | "cancelling" | "frozen" | "pending" | "cancelled" | "inactive";

/** Whether the merchant currently has the paid plan's entitlements. */
export function grantsPaidAccess(phase: SubscriptionPhase): boolean {
  return phase === "active" || phase === "cancelling";
}

export type BillingStatus =
  | { readonly kind: "free" }
  | {
      readonly kind: "subscribed";
      readonly phase: SubscriptionPhase;
      /** The catalogue plan's name, or `null` when Shopify's plan handle is not one we know. Never a guess. */
      readonly name: string | null;
      /** In the subscription's OWN currency (Shopify's), which need not be the catalogue's. */
      readonly price: Money | null;
      readonly interval: "every_30_days" | "annual" | null;
      /** Epoch ms — set only while a trial is still running. */
      readonly trialEndsAt: number | null;
      /** Epoch ms of the end of the current billing period, or `null` when Shopify has not told us. Never invented. */
      readonly currentPeriodEndsAt: number | null;
      /**
       * Partner's `cancelEffectiveOn`: a calendar DATE (`YYYY-MM-DD`), not an instant. Only meaningful for `cancelling`;
       * `null` when it was not reported. Never turn it into a timestamp (see `dateOnlyInstant`).
       */
      readonly cancelsOn: string | null;
    };

/** The slice of `shop_subscriptions` (and its first price item) this module reads. */
export interface PartnerSubscriptionProjection {
  readonly status: SubscriptionStatus;
  readonly planHandle: string | null;
  readonly billingInterval: string | null;
  /** Integer minor units, paired with `priceCurrency`. */
  readonly priceAmount: number | null;
  readonly priceCurrency: string | null;
  readonly trialEndsAt: number | null;
  readonly currentPeriodEndsAt: number | null;
  readonly cancelEffectiveOn: string | null;
}

const PHASE_BY_STATUS: Readonly<Record<Exclude<SubscriptionStatus, "NONE">, SubscriptionPhase>> = {
  ACTIVE: "active",
  CANCELLATION_SCHEDULED: "cancelling",
  FROZEN: "frozen",
  PENDING: "pending",
  CANCELED: "cancelled",
  UNKNOWN: "inactive",
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A `YYYY-MM-DD` date as the instant at midnight UTC, for formatting with the `UTC` zone so the calendar day printed
 * is the day stored in every time zone. `null` for anything that is not a real calendar date.
 */
export function dateOnlyInstant(value: string | null): number | null {
  if (value === null || !DATE_ONLY.test(value)) return null;
  const instant = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(instant)) return null;
  return new Date(instant).toISOString().slice(0, 10) === value ? instant : null;
}

function priceOf(projection: PartnerSubscriptionProjection): Money | null {
  if (projection.priceAmount === null || projection.priceCurrency === null) return null;
  const currency = toCurrency(projection.priceCurrency);
  if (!currency.ok) return null;
  const money = fromMinorUnits(projection.priceAmount, currency.value);
  return money.ok ? money.value : null;
}

function intervalOf(billingInterval: string | null): Extract<BillingStatus, { kind: "subscribed" }>["interval"] {
  if (billingInterval === "EVERY_30_DAYS") return "every_30_days";
  if (billingInterval === "ANNUAL") return "annual";
  return null;
}

/**
 * Convert the durable Partner projection into billing-page data. `planName` is the catalogue name for the
 * projection's plan handle, or `null` when the handle is unknown. `now` is a parameter (@rules/core.md).
 */
export function resolveProjectionBillingStatus(
  projection: PartnerSubscriptionProjection | undefined,
  planName: string | null,
  now: number,
): BillingStatus {
  if (!projection || projection.status === "NONE") return { kind: "free" };
  const phase = PHASE_BY_STATUS[projection.status];
  return {
    kind: "subscribed",
    phase,
    name: planName,
    price: priceOf(projection),
    interval: intervalOf(projection.billingInterval),
    trialEndsAt:
      phase === "active" && projection.trialEndsAt !== null && projection.trialEndsAt > now
        ? projection.trialEndsAt
        : null,
    currentPeriodEndsAt: projection.currentPeriodEndsAt,
    cancelsOn: phase === "cancelling" && dateOnlyInstant(projection.cancelEffectiveOn) !== null
      ? projection.cancelEffectiveOn
      : null,
  };
}
