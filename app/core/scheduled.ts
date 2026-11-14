import type { DrainReport } from "@firesio/portal-client";
import { cronPlanFor } from "./cron";

export interface ScheduledDeps {
  /** Send the outbox's due events to the portal's Queue. */
  readonly drainOutbox: () => Promise<DrainReport>;
  readonly sendSnapshot: () => Promise<"sent" | "failed">;
  /** Delete what has expired: sent outbox rows, spent usage counters, abandoned uploads. How many went, by name. */
  readonly prune: () => Promise<Readonly<Record<string, number>>>;
  readonly log: (entry: Readonly<Record<string, unknown>>) => void;
}

async function step(deps: ScheduledDeps, name: string, run: () => Promise<Record<string, unknown>>): Promise<void> {
  try {
    deps.log({ event: "cron.step", step: name, ...(await run()) });
  } catch (error) {
    // Logged, not thrown: a cron that throws does not run the rest, and each step is repaired by the next tick.
    deps.log({ event: "cron.step_failed", step: name, error: error instanceof Error ? error.name : "unknown" });
  }
}

/** What one cron tick does (`core/cron.ts` decides which). Each step guards its own errors. */
export async function runScheduled(deps: ScheduledDeps, cron: string): Promise<void> {
  const plan = cronPlanFor(cron);
  await step(deps, "outbox_drain", async () => ({ ...(await deps.drainOutbox()) }));
  if (!plan.daily) return;
  await step(deps, "metrics_snapshot", async () => ({ result: await deps.sendSnapshot() }));
  await step(deps, "prune", async () => ({ ...(await deps.prune()) }));
}
