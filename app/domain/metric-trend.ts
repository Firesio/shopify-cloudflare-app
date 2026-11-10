export type Trend = "up" | "down" | "flat";

/**
 * Which way a metric moved. `change` is the fractional change against the previous period (0.125 is +12.5%). Zero, and
 * anything that is not a finite number (no previous period to compare with), is `flat`: never a made-up direction.
 */
export function trendOf(change: number): Trend {
  if (!Number.isFinite(change) || change === 0) return "flat";
  return change > 0 ? "up" : "down";
}
