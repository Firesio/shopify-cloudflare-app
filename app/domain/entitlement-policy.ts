import type { SubscriptionStatus } from "./subscription-lifecycle";
import { isValidTimeZone, monthWindowInZone } from "./zone-day";
export type { SubscriptionStatus } from "./subscription-lifecycle";

export type UsagePeriod = "lifetime" | "calendar_month" | "billing_period";
export type EntitlementKey = string;
export type UsageWindow =
  | { readonly kind: "lifetime"; readonly key: "lifetime" }
  | { readonly kind: "calendar_month" | "billing_period"; readonly key: string; readonly start: number; readonly end: number };
export type FeatureDefinition = { readonly kind: "capability" } | { readonly kind: "capacity" } | { readonly kind: "quota"; readonly period: UsagePeriod };
export type EntitlementGrant = { readonly kind: "disabled" } | { readonly kind: "enabled" } | { readonly kind: "unlimited" } | { readonly kind: "limit"; readonly maximum: number };
export interface EntitlementCatalogue<K extends string = string> { readonly version: number; readonly freePlan: string; /** Plan handles cheapest first; what "the first plan that grants X" scans. Defaults to the order of `plans`. */ readonly ladder?: readonly string[]; readonly features: Readonly<Record<K, FeatureDefinition>>; readonly plans: Readonly<Record<string, Readonly<Record<K, EntitlementGrant>>>>; }

/**
 * Types a catalogue by the keys its `features` define: every plan must then grant every key (a missing grant is a compile error,
 * as it was when each feature was a field of the plan), and a service built on it accepts only those keys. Returns the catalogue
 * unchanged. A plain `EntitlementCatalogue` (keys are any string) keeps working everywhere.
 */
export function defineCatalogue<const K extends string>(catalogue: EntitlementCatalogue<K>): EntitlementCatalogue<K> { return catalogue; }
export interface SubscriptionSnapshot { readonly status: SubscriptionStatus; readonly planHandle: string | null; readonly revision: number; readonly verifiedAt?: number; readonly cancellationEffectiveAt?: number; readonly periodStart?: number; readonly periodEnd?: number; /** IANA zone a `calendar_month` quota resets in (the merchant's own midnight). Absent means UTC. */ readonly timeZone?: string; }
export type EntitlementDenialReason = "inactive_subscription" | "unknown_feature" | "unknown_plan" | "invalid_grant" | "invalid_usage_window" | "disabled" | "invalid_catalogue";
export type ResolvedEntitlement =
  | { readonly allowed: true; readonly kind: "capability" }
  | { readonly allowed: true; readonly kind: "capacity"; readonly maximum?: number }
  | { readonly allowed: true; readonly kind: "quota"; readonly maximum?: number; readonly period: UsagePeriod; readonly window: UsageWindow }
  | { readonly allowed: false; readonly reason: EntitlementDenialReason };

export function resolveUsageWindow(period: UsagePeriod, now: number, subscription: SubscriptionSnapshot): UsageWindow | null {
  if (!Number.isSafeInteger(now)) return null;
  if (period === "lifetime") return { kind: "lifetime", key: "lifetime" };
  if (period === "calendar_month") {
    if (subscription.timeZone !== undefined) {
      if (!isValidTimeZone(subscription.timeZone)) return null;
      return { kind: "calendar_month", ...monthWindowInZone(now, subscription.timeZone) };
    }
    const date = new Date(now);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month)) return null;
    const start = Date.UTC(year, month, 1);
    const end = Date.UTC(year, month + 1, 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    return { kind: period, key, start, end };
  }
  const { periodStart: start, periodEnd: end } = subscription;
  if (start === undefined || end === undefined || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end || now < start || now >= end) return null;
  return { kind: period, key: `${start}:${end}`, start, end };
}

function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined { return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined; }
function active(subscription: SubscriptionSnapshot, now: number): boolean {
  const cancellationAt = subscription.cancellationEffectiveAt;
  const validCancellation = cancellationAt !== undefined && Number.isSafeInteger(cancellationAt);
  return subscription.status === "ACTIVE" || subscription.status === "NONE" || (subscription.status === "CANCELLATION_SCHEDULED" && validCancellation && now < cancellationAt);
}
function validMaximum(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }

export function calculateRemaining(maximum: number, used: number): number | null {
  if (!validMaximum(maximum) || !validMaximum(used)) return null;
  return used >= maximum ? 0 : maximum - used;
}

export function resolveEntitlement(catalogue: EntitlementCatalogue, subscription: SubscriptionSnapshot, key: EntitlementKey, now: number): ResolvedEntitlement {
  if (!Number.isSafeInteger(now)) return { allowed: false, reason: "invalid_usage_window" };
  if (catalogue.version !== 1) return { allowed: false, reason: "invalid_catalogue" };
  const definition = own(catalogue.features, key);
  if (!definition) return { allowed: false, reason: "unknown_feature" };
  if (!active(subscription, now)) return { allowed: false, reason: "inactive_subscription" };
  const planHandle = subscription.status === "NONE" ? catalogue.freePlan : subscription.planHandle ?? catalogue.freePlan;
  const grants = own(catalogue.plans, planHandle);
  if (!grants) return { allowed: false, reason: "unknown_plan" };
  const grant = own(grants, key);
  if (!grant) return { allowed: false, reason: "unknown_plan" };
  if (grant.kind === "disabled") return { allowed: false, reason: "disabled" };
  if (definition.kind === "capability") return grant.kind === "enabled" || grant.kind === "unlimited" ? { allowed: true, kind: "capability" } : { allowed: false, reason: "invalid_grant" };
  if (grant.kind !== "unlimited" && (grant.kind !== "limit" || !validMaximum(grant.maximum))) return { allowed: false, reason: "invalid_grant" };
  const maximum = grant.kind === "limit" ? grant.maximum : undefined;
  if (definition.kind === "capacity") return { allowed: true, kind: "capacity", ...(maximum === undefined ? {} : { maximum }) };
  const window = resolveUsageWindow(definition.period, now, subscription);
  if (!window) return { allowed: false, reason: "invalid_usage_window" };
  return { allowed: true, kind: "quota", period: definition.period, window, ...(maximum === undefined ? {} : { maximum }) };
}
