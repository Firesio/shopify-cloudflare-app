import type { SeatScanCursor } from "~/ports/member-seat-overage";
import type { MemberStore } from "~/ports/members";
import { reviewSeatOverage, type SeatOverageDependencies } from "./review-seat-overage";

export interface SeatSweepDependencies extends SeatOverageDependencies {
  readonly members: SeatOverageDependencies["members"] & Pick<MemberStore, "listShopsWithSeveralActive">;
  readonly scan: SeatScanCursor;
}

/**
 * How many shops one cron tick may look at, per source. Each review is a handful of indexed reads and, when a shop really
 * is over, a few writes; the batch keeps a tick bounded however many shops there are. A fleet larger than a batch is
 * covered over several ticks by the cursor: `batch x ticks per day` shops a day.
 */
export const SEAT_SWEEP_BATCH = 50;

/**
 * The cron's part of the seat-overage policy: it finishes what a plan change started (a notice that could not be sent, a
 * deadline that has passed) and finds shops that went over their limit without a plan change (an owner admitted past the
 * limit, a catalogue that changed in a deploy).
 *
 *   - shops with an open episode that still needs its notice or whose deadline has passed;
 *   - the next batch of installed shops with more than one active member, from where the last tick stopped.
 *
 * Under `never_remove` it returns at once: not one query, no cursor read, nothing. One shop failing never costs the rest
 * their turn. The counts it returns go into the cron's log line.
 */
export async function sweepSeatOverage(now: number, deps: SeatSweepDependencies): Promise<Readonly<Record<string, number>>> {
  if (deps.config.policy === "never_remove") return { policy_off: 1 };

  const due = await deps.episodes.listDue(now, SEAT_SWEEP_BATCH);
  const cursor = await deps.scan.read();
  const scanned = await deps.members.listShopsWithSeveralActive(cursor, SEAT_SWEEP_BATCH);
  const counts: Record<string, number> = { due: due.length, scanned: scanned.length };

  for (const shop of new Set([...due, ...scanned])) {
    try {
      const { outcome } = await reviewSeatOverage(shop, now, deps);
      counts[outcome] = (counts[outcome] ?? 0) + 1;
    } catch (error) {
      counts.failed = (counts.failed ?? 0) + 1;
      await deps.log({ event: "member.seat_review_failed", shop, reason: error instanceof Error ? error.name : "unknown" });
    }
  }
  // A short batch means the end of the list: the next tick starts again from the top.
  await deps.scan.write(scanned.length < SEAT_SWEEP_BATCH ? null : (scanned[scanned.length - 1] ?? null), now);
  return counts;
}
