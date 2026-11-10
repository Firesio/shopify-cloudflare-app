import type { Trend } from "~/domain/metric-trend";
import { SkeletonBadge, SkeletonText } from "~/components/admin/Skeleton";

/** What a trend badge shows, keyed by the union so a new direction cannot be left without one. */
const TREND_BADGE = {
  up: { tone: "success", icon: "arrow-up" },
  down: { tone: "critical", icon: "arrow-down" },
  flat: { tone: "neutral", icon: "minus" },
} as const satisfies Record<Trend, { readonly tone: "success" | "critical" | "neutral"; readonly icon: "arrow-up" | "arrow-down" | "minus" }>;

/** The two values that depend on data, already formatted for the reader; `"loading"` while they are on their way. */
export type MetricReading = { readonly value: string; readonly change: string; readonly trend: Trend } | "loading";

type MetricCardProps = {
  readonly label: string;
  readonly href: string;
  readonly reading: MetricReading;
};

/**
 * One metric tile. The label and the link are static and render at once; `reading: "loading"` swaps only the value and
 * the trend badge for skeletons inside this same markup, so the card keeps its shape when the numbers arrive.
 */
export function MetricCard({ label, href, reading }: MetricCardProps) {
  return (
    <s-clickable href={href} paddingBlock="small-400" paddingInline="small-100" borderRadius="base">
      <s-grid gap="small-300">
        <s-heading>{label}</s-heading>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          {reading === "loading" ? (
            <>
              <SkeletonText chars={8} type="strong" />
              <SkeletonBadge chars={6} />
            </>
          ) : (
            <>
              <s-text type="strong">{reading.value}</s-text>
              <s-badge tone={TREND_BADGE[reading.trend].tone} icon={TREND_BADGE[reading.trend].icon}>
                {reading.change}
              </s-badge>
            </>
          )}
        </s-stack>
      </s-grid>
    </s-clickable>
  );
}
