import { describe, expect, it } from "vitest";
import { DAILY_CRON, DRAIN_ONLY_CRON, cronPlanFor } from "./cron";
import { runScheduled, type ScheduledDeps } from "./scheduled";

function harness(over: Partial<ScheduledDeps> = {}) {
  const steps: string[] = [];
  const logs: Record<string, unknown>[] = [];
  const deps: ScheduledDeps = {
    drainOutbox: async () => { steps.push("drain"); return { picked: 0, sent: 0, retried: 0, dead: 0, left: 0, storeErrors: 0 }; },
    sendSnapshot: async () => { steps.push("snapshot"); return "sent"; },
    prune: async () => { steps.push("prune"); return {}; },
    log: (entry) => void logs.push(entry),
    ...over,
  };
  return { deps, steps, logs };
}

describe("cronPlanFor", () => {
  it("drains on every tick and runs the daily work on all but the drain-only one", () => {
    expect(cronPlanFor(DRAIN_ONLY_CRON)).toEqual({ drain: true, daily: false });
    expect(cronPlanFor(DAILY_CRON).daily).toBe(true);
    expect(cronPlanFor("*/5 * * * *").daily).toBe(true);
    expect(cronPlanFor("something new").daily).toBe(true);
  });
});

describe("runScheduled", () => {
  it("only drains on the drain-only tick", async () => {
    const { deps, steps } = harness();
    await runScheduled(deps, DRAIN_ONLY_CRON);
    expect(steps).toEqual(["drain"]);
  });

  it("drains, snapshots and prunes on the daily tick", async () => {
    const { deps, steps } = harness();
    await runScheduled(deps, DAILY_CRON);
    expect(steps).toEqual(["drain", "snapshot", "prune"]);
  });

  it("a failing step is logged and never costs the next one its turn", async () => {
    const { deps, steps, logs } = harness({ drainOutbox: async () => { throw new TypeError("queue down"); } });
    await runScheduled(deps, DAILY_CRON);
    expect(steps).toEqual(["snapshot", "prune"]);
    expect(logs).toContainEqual({ event: "cron.step_failed", step: "outbox_drain", error: "TypeError" });
  });
});
