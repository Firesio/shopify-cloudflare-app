import { afterEach, describe, expect, it, vi } from "vitest";
import type { RetentionTarget } from "~/domain/retention";
import { RETENTION_POLICY } from "~/domain/retention";
import type { RetentionStore } from "~/ports/retention";
import { pruneExpiredRecords, RETENTION_BATCH_SIZE, RETENTION_MAX_BATCHES } from "./prune-expired-records";

const NOW = 1_800_000_000_000;

/** A store holding `expired[target]` expired rows that deletes them a batch at a time, as D1 would. */
function storeWith(expired: Partial<Record<RetentionTarget, number>>, failing: readonly RetentionTarget[] = []) {
  const left = { ...expired };
  const calls: { target: RetentionTarget; cutoff: number; limit: number }[] = [];
  const store: RetentionStore = {
    async prune(target, cutoff, limit) {
      calls.push({ target, cutoff, limit });
      if (failing.includes(target)) throw new Error(`${target} is locked`);
      const removed = Math.min(limit, left[target] ?? 0);
      left[target] = (left[target] ?? 0) - removed;
      return removed;
    },
  };
  return { store, calls, left };
}

const outcomeOf = (results: Awaited<ReturnType<typeof pruneExpiredRecords>>, target: RetentionTarget) =>
  results.find((result) => result.target === target)?.outcome;

afterEach(() => vi.restoreAllMocks());

describe("pruneExpiredRecords", () => {
  it("visits every target once when nothing is expired", async () => {
    const { store, calls } = storeWith({});
    const results = await pruneExpiredRecords(NOW, store);
    expect(results.map(({ target }) => target)).toEqual(Object.keys(RETENTION_POLICY));
    expect(results.every(({ outcome }) => outcome.status === "done" && outcome.deleted === 0)).toBe(true);
    expect(calls).toHaveLength(Object.keys(RETENTION_POLICY).length);
  });

  it("drains a target across batches and stops at the first short batch", async () => {
    const { store, calls, left } = storeWith({ notification_logs: RETENTION_BATCH_SIZE * 2 + 7 });
    const results = await pruneExpiredRecords(NOW, store);
    expect(outcomeOf(results, "notification_logs")).toEqual({ status: "done", deleted: RETENTION_BATCH_SIZE * 2 + 7 });
    expect(calls.filter((call) => call.target === "notification_logs")).toHaveLength(3);
    expect(left.notification_logs).toBe(0);
  });

  it("stops at the batch cap and reports a backlog for the next tick", async () => {
    const total = RETENTION_BATCH_SIZE * RETENTION_MAX_BATCHES + 1;
    const { store, left } = storeWith({ ai_runs: total });
    const results = await pruneExpiredRecords(NOW, store);
    expect(outcomeOf(results, "ai_runs")).toEqual({ status: "backlog", deleted: RETENTION_BATCH_SIZE * RETENTION_MAX_BATCHES });
    expect(left.ai_runs).toBe(1);
  });

  it("passes each target its own cutoff", async () => {
    const { store, calls } = storeWith({});
    await pruneExpiredRecords(NOW, store);
    const day = 24 * 60 * 60 * 1000;
    expect(calls.find((call) => call.target === "staff_audit_logs")?.cutoff).toBe(NOW - 365 * day);
    expect(calls.find((call) => call.target === "webhook_deliveries_processed")?.cutoff).toBe(NOW - 90 * day);
  });

  it("isolates a failing target: it is logged and reported, the others still run", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store, left } = storeWith({ mcp_audit_logs: 3, staff_audit_logs: 4 }, ["mcp_audit_logs"]);
    const results = await pruneExpiredRecords(NOW, store);
    expect(outcomeOf(results, "mcp_audit_logs")).toEqual({ status: "failed", deleted: 0, error: "mcp_audit_logs is locked" });
    expect(outcomeOf(results, "staff_audit_logs")).toEqual({ status: "done", deleted: 4 });
    expect(left.staff_audit_logs).toBe(0);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"event":"retention.prune_failed"'));
  });
});
