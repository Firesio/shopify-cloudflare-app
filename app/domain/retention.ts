/**
 * How long operational records are kept before the daily sweep deletes them.
 *
 * The rule for every entry: keep a record exactly as long as it serves the
 * purpose it was written for, then erase it. A shop's data is also erased in
 * full on `shop/redact` (app/services/tenant-purge.server.ts); these periods
 * bound everything else, so no log grows forever.
 *
 * Records that ARE the business state (shops, subscriptions, support
 * conversations, lifecycle events used for ordering decisions) are not here:
 * they live until the shop is redacted. Adding a log table means adding an
 * entry here, the adapter's map entry, and a test; the sweep itself does not
 * change. State the periods to merchants in the privacy policy.
 */
export type RetentionTarget =
  | "webhook_deliveries_processed"
  | "webhook_deliveries_failed"
  | "notification_logs"
  | "ai_runs"
  | "mcp_audit_logs"
  | "staff_audit_logs";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionRule {
  readonly keepDays: number;
  /** Why this long. Shown nowhere; it is the reason a reviewer should not shorten it blindly. */
  readonly reason: string;
}

export const RETENTION_POLICY: Readonly<Record<RetentionTarget, RetentionRule>> = {
  webhook_deliveries_processed: {
    keepDays: 90,
    reason:
      "The delivery id is the dedupe key. Shopify retries for 4 hours and a queue holds a message for at most 14 days, " +
      "so 90 days is far past any redelivery while still covering a quarter of debugging.",
  },
  webhook_deliveries_failed: {
    keepDays: 180,
    reason: "Failed and dead-lettered deliveries are investigated by staff; keep them longer than the ones that worked.",
  },
  notification_logs: {
    keepDays: 90,
    reason: "Recipients are personal data. Long enough to answer 'did they get the email?', past every retry's dedupe window.",
  },
  ai_runs: {
    keepDays: 400,
    reason: "Token metering, no content. Thirteen months so a year-over-year cost comparison is possible.",
  },
  mcp_audit_logs: {
    keepDays: 365,
    reason: "Security audit trail for API and agent access; one year is the usual audit horizon.",
  },
  staff_audit_logs: {
    keepDays: 365,
    reason: "Security audit trail for staff access to merchant data; one year is the usual audit horizon.",
  },
};

export interface RetentionCutoff {
  readonly target: RetentionTarget;
  /** Records strictly older than this epoch-ms instant are deleted. */
  readonly cutoff: number;
}

/** Every target with the instant before which its records expire, in policy order. */
export function retentionCutoffs(now: number): readonly RetentionCutoff[] {
  return retentionTargets().map((target) => ({ target, cutoff: now - RETENTION_POLICY[target].keepDays * DAY_MS }));
}

function retentionTargets(): readonly RetentionTarget[] {
  // Object.keys loses the key type; filtering through the policy keeps it without a cast.
  return Object.keys(RETENTION_POLICY).filter(isRetentionTarget);
}

function isRetentionTarget(value: string): value is RetentionTarget {
  return value in RETENTION_POLICY;
}
