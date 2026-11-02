/**
 * How an announcement is delivered once it is sending. PURE: the numbers that pace it and the one decision that
 * says whether to keep going.
 *
 * Delivery is a chain of small steps, each a queue message that sends one page of recipients and then schedules the
 * next. The gap between pages is the throttle: a campaign can never send faster than one page per gap, which keeps
 * it far under the daily quota and gives a problem a moment to show before many more mails have gone.
 */

/** Recipients handled per step. */
export const PUMP_PAGE_SIZE = 25;
/** Wait between steps while all is well. */
export const PUMP_GAP_SECONDS = 2;
/** Wait after a step whose sends hit transient provider errors (quota, throttling, an outage). */
export const PUMP_BACKOFF_SECONDS = 300;
/** A `sending` campaign whose chain has been silent this long is assumed lost and is restarted. */
export const PUMP_STALL_MS = 15 * 60 * 1000;
/** A recipient is given up on as failed after this many transient errors, so one bad address cannot hold the line. */
export const MAX_RECIPIENT_ATTEMPTS = 3;

/** Fewer sends than this say nothing about a failure RATE: a handful of bad addresses is normal. */
const MIN_SAMPLE_FOR_RATE = 10;
/** Half or more of a sample failing permanently means something is wrong with the campaign, not the addresses. */
const FAILURE_RATE_LIMIT = 0.5;

export const PAUSE_REASONS = ["high_failure_rate", "channel_unavailable"] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export function isPauseReason(value: string): value is PauseReason {
  return PAUSE_REASONS.some((reason) => reason === value);
}

/** What one step did, by recipient outcome. */
export interface PageTally {
  readonly sent: number;
  /** The provider rejected it for good (a bounce, a suppressed address). */
  readonly failed: number;
  /** Not attempted for a reason about that recipient: unreachable address, opted out. */
  readonly refused: number;
  /** Left out: unsubscribed from announcements. */
  readonly skipped: number;
  /** Hit a transient error; will be tried again. */
  readonly transient: number;
  /** The mail channel itself is not set up, so nobody can be sent anything. */
  readonly unavailable: number;
}

export const EMPTY_TALLY: PageTally = { sent: 0, failed: 0, refused: 0, skipped: 0, transient: 0, unavailable: 0 };

export type PageVerdict =
  | { readonly next: "continue" }
  | { readonly next: "back_off" }
  | { readonly next: "pause"; readonly reason: PauseReason };

/**
 * Keep going, slow down, or stop? Stopping is for the problems that get worse with every mail sent: no mail channel
 * at all, or most of a meaningful sample bouncing (which damages the sending domain for everyone, announcements
 * and support replies alike). A transient error slows the chain but does not stop it: quota resets and outages end.
 */
export function judgePage(tally: PageTally): PageVerdict {
  if (tally.unavailable > 0) return { next: "pause", reason: "channel_unavailable" };
  const attempted = tally.sent + tally.failed;
  if (attempted >= MIN_SAMPLE_FOR_RATE && tally.failed / attempted >= FAILURE_RATE_LIMIT) {
    return { next: "pause", reason: "high_failure_rate" };
  }
  if (tally.transient > 0) return { next: "back_off" };
  return { next: "continue" };
}

export interface RecipientCounts {
  readonly pending: number;
  readonly sent: number;
  readonly failed: number;
  readonly refused: number;
  readonly skipped: number;
}

export const EMPTY_COUNTS: RecipientCounts = { pending: 0, sent: 0, failed: 0, refused: 0, skipped: 0 };

/** How far along, as a whole percent: every recipient that is no longer waiting counts as done. */
export function percentDone(counts: RecipientCounts): number {
  const total = counts.pending + counts.sent + counts.failed + counts.refused + counts.skipped;
  if (total === 0) return 0;
  return Math.floor(((total - counts.pending) / total) * 100);
}

/** What happened to one announcement mail, from the delivery step's point of view. */
export type MailOutcome =
  | { readonly kind: "sent" }
  /** The provider rejected it for good. */
  | { readonly kind: "rejected"; readonly reason: string }
  /** Never attempted, for a reason about this recipient. */
  | { readonly kind: "refused"; readonly reason: string }
  /** The mail channel is not set up at all. */
  | { readonly kind: "unavailable" }
  /** A transient error: try again later. */
  | { readonly kind: "transient" };

/** What to do with a recipient given what happened to its mail. */
export type Settlement =
  | { readonly action: "settle"; readonly status: "sent" | "failed" | "refused"; readonly reasonCode: string | null; readonly counts: keyof PageTally }
  /** Leave it pending and count the attempt. */
  | { readonly action: "retry"; readonly counts: "transient" }
  /** Leave it pending without counting an attempt: nothing is wrong with the recipient. */
  | { readonly action: "hold"; readonly counts: "unavailable" };

/**
 * The one decision per mail: record it, try it again, or leave it be. A transient error is tried again until
 * `MAX_RECIPIENT_ATTEMPTS`, then given up on as a failure, so one address that always errors cannot hold up a page
 * (the next page starts with whoever has been tried least).
 */
export function settlementOf(outcome: MailOutcome, attemptsSoFar: number): Settlement {
  switch (outcome.kind) {
    case "sent":
      return { action: "settle", status: "sent", reasonCode: null, counts: "sent" };
    case "rejected":
      return { action: "settle", status: "failed", reasonCode: outcome.reason, counts: "failed" };
    case "refused":
      return { action: "settle", status: "refused", reasonCode: outcome.reason, counts: "refused" };
    case "unavailable":
      return { action: "hold", counts: "unavailable" };
    case "transient":
      return attemptsSoFar + 1 >= MAX_RECIPIENT_ATTEMPTS
        ? { action: "settle", status: "failed", reasonCode: "transport_error", counts: "failed" }
        : { action: "retry", counts: "transient" };
    default:
      return assertNever(outcome);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled mail outcome: ${JSON.stringify(value)}`);
}
