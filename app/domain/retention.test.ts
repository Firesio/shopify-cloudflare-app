import { describe, expect, it } from "vitest";
import { RETENTION_POLICY, retentionCutoffs } from "./retention";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe("retentionCutoffs", () => {
  it("gives every target in the policy exactly one cutoff", () => {
    const targets = retentionCutoffs(NOW).map(({ target }) => target);
    expect(targets).toEqual(Object.keys(RETENTION_POLICY));
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("puts each cutoff keepDays before now", () => {
    for (const { target, cutoff } of retentionCutoffs(NOW)) {
      expect(NOW - cutoff).toBe(RETENTION_POLICY[target].keepDays * DAY);
    }
  });

  it("pins the published periods, so a change is a deliberate edit (and a privacy-policy update)", () => {
    expect(Object.fromEntries(Object.entries(RETENTION_POLICY).map(([target, rule]) => [target, rule.keepDays]))).toEqual({
      webhook_deliveries_processed: 90,
      webhook_deliveries_failed: 180,
      notification_logs: 90,
      ai_runs: 400,
      mcp_audit_logs: 365,
      staff_audit_logs: 365,
    });
  });

  it("keeps processed webhook deliveries well past the 14-day queue retention, so a redelivery is still deduped", () => {
    expect(RETENTION_POLICY.webhook_deliveries_processed.keepDays).toBeGreaterThan(14);
  });
});
