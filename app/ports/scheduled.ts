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
  /** Looks for shops that uninstalled without Shopify's webhook reaching us. Returns counts for the log. */
  readonly uninstallProbe: { run(now: number): Promise<Readonly<Record<string, number>>> };
}
