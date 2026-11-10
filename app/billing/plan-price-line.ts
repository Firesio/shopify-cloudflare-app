import type { BillingStatus } from "./subscription-status";
import type { Money } from "~/money";

/**
 * What the merchant is charged, as one line — or nothing, when we do not know or
 * when nothing is being charged.
 *
 * Failure modes this exists to prevent, each of which states a charge that is
 * not happening:
 *
 *   • Calling an ANNUAL subscription "/mo". The figure Shopify reports for a
 *     yearly plan is the yearly amount; labelling it monthly misstates what
 *     leaves the merchant's account by a factor of twelve.
 *   • Falling back to the catalogue price when the subscription carries none.
 *     A merchant may be on a grandfathered or discounted charge, so the
 *     catalogue figure is a guess — and a guess about money is a defect.
 *   • Quoting a price for a subscription that is cancelled or inactive.
 *   • Printing the free plan as a catalogue amount. The catalogue is USD, the
 *     merchant's currency is not necessarily, and zero needs no symbol: "Free".
 *
 * The figure is always the subscription's OWN money, in Shopify's currency. It is
 * never compared with or converted to the catalogue's.
 *
 * Pure, so every branch is provable without a Shopify call (@rules/money.md).
 */
export type PriceCadence = "monthly" | "yearly" | "none";

export type PlanPriceLine =
  | { readonly cadence: "free" }
  | { readonly cadence: PriceCadence; readonly price: Money };

export function planPriceLine(status: BillingStatus): PlanPriceLine | null {
  if (status.kind === "free") return { cadence: "free" };

  if (status.phase === "cancelled" || status.phase === "inactive") return null;
  if (!status.price) return null;

  if (status.interval === "annual") return { price: status.price, cadence: "yearly" };
  if (status.interval === "every_30_days") return { price: status.price, cadence: "monthly" };
  return { price: status.price, cadence: "none" };
}
