import { STANDARD_METRICS, defineMetrics } from "@firesio/portal-contract";

/**
 * The daily snapshot's catalogue (docs/architecture.md section 5.1): the four standard keys every app reports, plus the
 * app's own. Adding a metric is one line here and one collector in `wiring/metrics.ts`; the portal needs no change.
 */
export const METRICS = defineMetrics({
  ...STANDARD_METRICS,
  "tickets.created": { label: "Tickets created", kind: "count", rollup: "sum" },
  "tickets.open": { label: "Open tickets", kind: "count", rollup: "last" },
});
