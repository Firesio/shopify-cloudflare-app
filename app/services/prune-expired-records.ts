import { retentionCutoffs, type RetentionTarget } from "~/domain/retention";
import type { RetentionStore } from "~/ports/retention";

/** Rows per delete. Small enough that one statement never holds D1 for long. */
export const RETENTION_BATCH_SIZE = 500;
/** Batches per target per tick: at most 10 000 rows, so a backlog drains over several days, never in one long tick. */
export const RETENTION_MAX_BATCHES = 20;

export type PruneOutcome =
  | { readonly status: "done"; readonly deleted: number }
  /** Stopped at the batch cap with rows still expired; the next tick continues. */
  | { readonly status: "backlog"; readonly deleted: number }
  | { readonly status: "failed"; readonly deleted: number; readonly error: string };

/**
 * Delete every operational record past its retention period (app/domain/retention.ts).
 *
 * Each target is independent: one failing (a locked table, a bad migration)
 * is logged and reported, and the others still run. Rows deleted before the
 * failure stay deleted; the rest go on the next tick.
 */
export async function pruneExpiredRecords(
  now: number,
  store: RetentionStore,
): Promise<readonly { readonly target: RetentionTarget; readonly outcome: PruneOutcome }[]> {
  const results: { target: RetentionTarget; outcome: PruneOutcome }[] = [];
  // Sequential on purpose: D1 runs one query at a time, so parallel deletes only queue up behind each other.
  for (const { target, cutoff } of retentionCutoffs(now)) {
    results.push({ target, outcome: await pruneTarget(store, target, cutoff) });
  }
  return results;
}

async function pruneTarget(store: RetentionStore, target: RetentionTarget, cutoff: number): Promise<PruneOutcome> {
  let deleted = 0;
  try {
    for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch += 1) {
      const removed = await store.prune(target, cutoff, RETENTION_BATCH_SIZE);
      deleted += removed;
      if (removed < RETENTION_BATCH_SIZE) return { status: "done", deleted };
    }
    return { status: "backlog", deleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "retention.prune_failed", target, deleted, error: message }));
    return { status: "failed", deleted, error: message };
  }
}
