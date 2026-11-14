import { collectMetrics, utcDay, type Emitter } from "@firesio/portal-client";
import type { Money } from "@firesio/portal-contract";
import { METRICS } from "./metrics";
import { PLANS } from "./plans";
import type { MetricsPort } from "./shops/ports";

export interface SnapshotDeps {
  readonly metrics: MetricsPort;
  readonly portal: Emitter;
  readonly log: (entry: Readonly<Record<string, unknown>>) => void;
}

const DAY_MS = 86_400_000;

/** MRR by currency: the paying shops of each plan times that plan's monthly price (Shopify keeps the real price). */
export function mrrOf(payingByPlan: Readonly<Record<string, number>>): readonly Money[] {
  const total: Record<string, number> = {};
  for (const [handle, count] of Object.entries(payingByPlan)) {
    const plan = Object.entries(PLANS).find(([key]) => key === handle)?.[1];
    if (plan !== undefined && plan.monthly.amount > 0) total[plan.monthly.currency] = (total[plan.monthly.currency] ?? 0) + plan.monthly.amount * count;
  }
  return Object.entries(total).map(([currency, amount]) => ({ amount, currency }));
}

/**
 * The daily `metrics.snapshot` for YESTERDAY (UTC): aggregates only, no personal data. The event id carries the day, so a
 * retried cron tick is the same event; a correction is sent again with a new id by hand.
 */
export async function sendDailySnapshot(deps: SnapshotDeps, now: number): Promise<"sent" | "failed"> {
  const day = utcDay(new Date(now - DAY_MS));
  const { metrics } = deps;
  const values = await collectMetrics(
    METRICS,
    {
      "shops.installed": () => metrics.installedOn(day),
      "shops.uninstalled": () => metrics.uninstalledOn(day),
      "shops.active": () => metrics.activeShops(),
      "revenue.mrr": async () => mrrOf(await metrics.payingShopsByPlan()),
      "tickets.created": () => metrics.ticketsCreatedOn(day),
      "tickets.open": () => metrics.openTickets(),
    },
    { day, requireStandard: true },
  );
  if (!values.ok) {
    deps.log({ event: "metrics.collect_failed", day, reason: values.reason });
    return "failed";
  }
  const sent = await deps.portal.metricsSnapshot({ day, catalogue: METRICS, values: values.value }, { eventId: `metrics:${day}`, occurredAt: new Date(now) });
  if (!sent.ok) deps.log({ event: "metrics.send_failed", day, reason: sent.reason });
  return sent.ok ? "sent" : "failed";
}
