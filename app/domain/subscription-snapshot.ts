// Ring 1 — pure. The subscription snapshot the entitlement policy decides from, built from the facts an app holds about
// a shop. This is the template's DEFAULT reading and it fails closed: a shop that is not installed, or whose billing was
// never observed, is UNKNOWN (nothing is granted, not even the free plan). An app that wants a free shop usable before its
// first billing observation replaces this one function and hands the model revision 0 (see docs/entitlements.md).
import type { Plan } from "~/billing/plans";
import { resolveEffectivePlan, type ActivePromoGrant } from "./plan-hierarchy";
import type { SubscriptionSnapshot } from "./entitlement-policy";
import type { SubscriptionStatus } from "./subscription-lifecycle";

export interface SnapshotFacts {
  /** The shop is installed now (a local uninstall denies whatever the projection still says). */
  readonly installed: boolean;
  /** The current billing projection, absent until billing was first observed. */
  readonly projection: {
    readonly status: SubscriptionStatus;
    readonly planHandle: string | null;
    readonly revision: number;
    readonly currentPeriodStartsAt: number | null;
    readonly currentPeriodEndsAt: number | null;
    readonly cancellationEffectiveAt: number | null;
  } | undefined;
  /** The promotional grant in force, if any. */
  readonly grant: ActivePromoGrant | null | undefined;
  /** The shop's IANA time zone, which decides where a `calendar_month` quota resets; absent means UTC. */
  readonly timeZone: string | null;
}

export function subscriptionSnapshot(facts: SnapshotFacts, planList: readonly Plan[], now: number): SubscriptionSnapshot {
  const { projection, grant } = facts;
  const effective = resolveEffectivePlan(projection?.planHandle, projection?.status, grant, planList, now);
  const promoted = projection === undefined && effective.source === "promo";
  if (!facts.installed || (projection === undefined && !promoted)) return { status: "UNKNOWN", planHandle: null, revision: 0 };
  const status = effective.source === "promo" ? "ACTIVE" : projection?.status ?? "UNKNOWN";
  const periodStart = projection?.currentPeriodStartsAt ?? grant?.startsAt;
  const periodEnd = projection?.currentPeriodEndsAt ?? grant?.expiresAt;
  const cancellationEffectiveAt = projection?.cancellationEffectiveAt;
  // An absent fact is an absent field: neither `undefined` nor `null` travels into the snapshot (or its cache entry).
  return {
    status,
    planHandle: effective.planHandle,
    revision: projection?.revision ?? 0,
    ...(periodStart === undefined || periodStart === null ? {} : { periodStart }),
    ...(periodEnd === undefined || periodEnd === null ? {} : { periodEnd }),
    ...(cancellationEffectiveAt === undefined || cancellationEffectiveAt === null ? {} : { cancellationEffectiveAt }),
    ...(facts.timeZone === null ? {} : { timeZone: facts.timeZone }),
  };
}
