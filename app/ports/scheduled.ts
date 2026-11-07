import type { RetentionStore } from "~/ports/retention";

export interface ExpiredUpload {
  readonly id: string;
  readonly r2Key: string;
}

export interface ScheduledDependencies {
  readonly tokens: { deleteExpiredBefore(cutoff: number): Promise<number> };
  /** Deletes operational records past their retention period (app/domain/retention.ts). */
  readonly retention: RetentionStore;
  readonly uploads: {
    listExpiredUploads(cutoff: number): Promise<readonly ExpiredUpload[]>;
    deleteExpiredUploads(ids: readonly string[], cutoff: number): Promise<number>;
    deleteUploadObjects(keys: readonly string[]): Promise<void>;
  };
  readonly history: { reconcile(now: number): Promise<{ status: "succeeded"; pages: number; events: number } | { status: "failed"; code: string; detail: string }> };
  /**
   * Settles quota reservations and capacity allocations that a crashed run left `held`
   * (app/services/entitlement-held-sweep.ts). Returns counts for the log.
   */
  readonly entitlementReconcile: { run(now: number): Promise<Readonly<Record<string, number>>> };
  /** Looks for shops that uninstalled without Shopify's webhook reaching us. Returns counts for the log. */
  readonly uninstallProbe: { run(now: number): Promise<Readonly<Record<string, number>>> };
  /** Restarts an announcement whose delivery chain went quiet (app/services/campaigns/restart-stalled.ts). Returns counts for the log. */
  readonly campaignWatchdog: { run(now: number): Promise<Readonly<Record<string, number>>> };
  /**
   * The seat-overage policy's part of the cron (app/services/members/sweep-seat-overage.ts): finishes notices and trims whose
   * deadline passed, and finds shops that went over their limit with no plan change. Does nothing, and queries nothing,
   * under `never_remove`. Returns counts for the log.
   */
  readonly memberSeatOverage: { run(now: number): Promise<Readonly<Record<string, number>>> };
}
