import type { RetentionTarget } from "~/domain/retention";

/** Deletes expired operational records, a bounded batch at a time. */
export interface RetentionStore {
  /** Delete at most `limit` records of `target` older than `cutoff`; returns how many went. */
  prune(target: RetentionTarget, cutoff: number, limit: number): Promise<number>;
}
