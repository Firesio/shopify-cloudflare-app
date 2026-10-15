/**
 * Month-over-month change for a dashboard figure, as a whole percentage.
 *
 * `null` when there is nothing to compare against (no previous value, or a
 * previous value of zero — "up from nothing" is not a percentage), so the caller
 * shows no badge instead of an invented one.
 */
export function percentChange(previous: number | undefined, current: number): number | null {
  if (previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** "+12%", "−8%", "0%": a typographic minus, and an explicit plus so direction reads at a glance. */
export function formatPercentChange(change: number): string {
  if (change > 0) return `+${change}%`;
  if (change < 0) return `−${Math.abs(change)}%`;
  return "0%";
}
