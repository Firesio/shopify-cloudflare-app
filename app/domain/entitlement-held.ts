// Ring 1 — pure. When a held quota reservation or capacity allocation counts as crashed (docs/entitlements.md,
// "Crash reconciliation"). A normal caller settles within one request or one queue retry; the cron sweep acts only on
// what is still held long after that.

/** A held item older than this is taken to belong to a run that crashed. */
export const HELD_MAX_AGE_MS = 30 * 60 * 1000;

/** How many held items one cron tick settles; the rest wait for the next tick, oldest first. */
export const HELD_SWEEP_BATCH = 200;

/** `true` from exactly `maxAgeMs` after creation. An item created in the future (clock skew) is never expired. */
export function isHeldExpired(
  createdAt: number,
  now: number,
  maxAgeMs: number = HELD_MAX_AGE_MS,
): boolean {
  return now - createdAt >= maxAgeMs;
}
