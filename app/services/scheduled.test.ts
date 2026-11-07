import { describe, expect, it, vi } from "vitest";
import { runScheduledSweeps } from "./scheduled.server";

describe("runScheduledSweeps", () => {
  it("uses injected token and history ports", async () => {
    const calls: string[] = [];
    await runScheduledSweeps(100, {
      tokens: { deleteExpiredBefore: async () => { calls.push("tokens"); return 0; } },
      retention: { prune: async () => 0 },
      uploads: {
        listExpiredUploads: async () => { calls.push("uploads"); return []; },
        deleteUploadObjects: async () => undefined,
        deleteExpiredUploads: async () => 0,
      },
      history: { reconcile: async () => { calls.push("history"); return { status: "succeeded", pages: 1, events: 0 }; } },
      entitlementReconcile: { run: async () => ({ examined: 0 }) },
      uninstallProbe: { run: async () => { calls.push("probe"); return { examined: 0 }; } },
      campaignWatchdog: { run: async () => ({ restarted: 0 }) },
      memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
    });
    expect(calls).toEqual(["tokens", "uploads", "history", "probe"]);
  });

  it("sweeps uploads in list, R2 delete, D1 delete order", async () => {
    const calls: string[] = [];
    await runScheduledSweeps(200, {
      tokens: { deleteExpiredBefore: async () => 0 },
      retention: { prune: async () => 0 },
      uploads: {
        listExpiredUploads: async (cutoff) => { calls.push(`list:${cutoff}`); return [{ id: "upload-1", r2Key: "r2/upload-1" }]; },
        deleteUploadObjects: async (keys) => { calls.push(`r2:${keys.join(",")}`); },
        deleteExpiredUploads: async (ids, cutoff) => { calls.push(`d1:${ids.join(",")}:${cutoff}`); return ids.length; },
      },
      history: { reconcile: async () => { calls.push("history"); return { status: "succeeded", pages: 1, events: 0 }; } },
      entitlementReconcile: { run: async () => ({ examined: 0 }) },
      uninstallProbe: { run: async () => { calls.push("probe"); return { examined: 0 }; } },
      campaignWatchdog: { run: async () => ({ restarted: 0 }) },
      memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
    });
    expect(calls).toEqual(["list:200", "r2:r2/upload-1", "d1:upload-1:200", "history", "probe"]);
  });

  it("leaves uploads for a later tick when R2 deletion fails", async () => {
    const calls: string[] = [];
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await runScheduledSweeps(200, {
        tokens: { deleteExpiredBefore: async () => 0 },
        retention: { prune: async () => 0 },
        uploads: {
          listExpiredUploads: async () => [{ id: "upload-1", r2Key: "r2/upload-1" }],
          deleteUploadObjects: async () => { calls.push("r2"); throw new Error("R2 unavailable"); },
          deleteExpiredUploads: async () => { calls.push("d1"); return 0; },
        },
        history: { reconcile: async () => { calls.push("history"); return { status: "succeeded", pages: 1, events: 0 }; } },
        entitlementReconcile: { run: async () => ({ examined: 0 }) },
        uninstallProbe: { run: async () => { calls.push("probe"); return { examined: 0 }; } },
        campaignWatchdog: { run: async () => ({ restarted: 0 }) },
        memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
      });
      expect(error).toHaveBeenCalledWith(expect.stringContaining('"event":"cron.sweep_failed"'));
      expect(error).toHaveBeenCalledWith(expect.stringContaining('"sweep":"pending_uploads"'));
    } finally {
      error.mockRestore();
    }
    expect(calls).toEqual(["r2", "history", "probe"]);
  });

  it("does not call R2 or D1 when there are no expired uploads", async () => {
    const calls: string[] = [];
    await runScheduledSweeps(200, {
      tokens: { deleteExpiredBefore: async () => 0 },
      retention: { prune: async () => 0 },
      uploads: {
        listExpiredUploads: async () => [],
        deleteUploadObjects: async () => { calls.push("r2"); },
        deleteExpiredUploads: async () => { calls.push("d1"); return 0; },
      },
      history: { reconcile: async () => { calls.push("history"); return { status: "succeeded", pages: 1, events: 0 }; } },
      entitlementReconcile: { run: async () => ({ examined: 0 }) },
      uninstallProbe: { run: async () => { calls.push("probe"); return { examined: 0 }; } },
      campaignWatchdog: { run: async () => ({ restarted: 0 }) },
      memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
    });
    expect(calls).toEqual(["history", "probe"]);
  });

  it("runs only the probe when daily maintenance is excluded", async () => {
    const calls: string[] = [];
    await runScheduledSweeps(300, {
      tokens: { deleteExpiredBefore: async () => { calls.push("tokens"); return 0; } },
      retention: { prune: async () => 0 },
      uploads: {
        listExpiredUploads: async () => { calls.push("uploads"); return []; },
        deleteUploadObjects: async () => undefined,
        deleteExpiredUploads: async () => 0,
      },
      history: { reconcile: async () => { calls.push("history"); return { status: "succeeded", pages: 1, events: 0 }; } },
      entitlementReconcile: { run: async () => ({ examined: 0 }) },
      uninstallProbe: { run: async () => { calls.push("probe"); return { examined: 0 }; } },
      campaignWatchdog: { run: async () => ({ restarted: 0 }) },
      memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
    }, { includeDailyMaintenance: false });
    expect(calls).toEqual(["probe"]);
  });

  it("a failing probe does not fail the tick", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(runScheduledSweeps(300, {
        tokens: { deleteExpiredBefore: async () => 0 },
        retention: { prune: async () => 0 },
        uploads: { listExpiredUploads: async () => [], deleteUploadObjects: async () => undefined, deleteExpiredUploads: async () => 0 },
        history: { reconcile: async () => ({ status: "succeeded", pages: 0, events: 0 }) },
        entitlementReconcile: { run: async () => ({ examined: 0 }) },
        uninstallProbe: { run: async () => { throw new Error("d1 down"); } },
        campaignWatchdog: { run: async () => ({ restarted: 0 }) },
        memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
      }, { includeDailyMaintenance: false })).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('"sweep":"uninstall_reconciliation"'));
    } finally {
      error.mockRestore();
    }
  });
});

describe("the retention sweep", () => {
  it("runs on the daily tick, with the tick's time, and not on the hourly probe-only tick", async () => {
    const cutoffs: number[] = [];
    const deps = {
      tokens: { deleteExpiredBefore: async () => 0 },
      retention: { prune: async (_target: string, cutoff: number) => { cutoffs.push(cutoff); return 0; } },
      uploads: { listExpiredUploads: async () => [], deleteUploadObjects: async () => undefined, deleteExpiredUploads: async () => 0 },
      history: { reconcile: async () => ({ status: "succeeded" as const, pages: 0, events: 0 }) },
      entitlementReconcile: { run: async () => ({ examined: 0 }) },
      uninstallProbe: { run: async () => ({ examined: 0 }) },
      campaignWatchdog: { run: async () => ({ restarted: 0 }) },
      memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await runScheduledSweeps(5_000_000_000_000, deps, { includeDailyMaintenance: false });
      expect(cutoffs).toEqual([]);
      await runScheduledSweeps(5_000_000_000_000, deps);
      expect(cutoffs.length).toBeGreaterThan(0);
      expect(cutoffs.every((cutoff) => cutoff < 5_000_000_000_000)).toBe(true);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('"sweep":"retention"'));
    } finally {
      log.mockRestore();
    }
  });
});

describe("the entitlement reconcile sweep", () => {
  const quiet = {
    tokens: { deleteExpiredBefore: async () => 0 },
    retention: { prune: async () => 0 },
    uploads: { listExpiredUploads: async () => [], deleteUploadObjects: async () => undefined, deleteExpiredUploads: async () => 0 },
    history: { reconcile: async () => ({ status: "succeeded" as const, pages: 0, events: 0 }) },
  };

  it("runs on every tick, the hourly probe-only one included, and before the probe", async () => {
    const calls: string[] = [];
    const deps = {
      ...quiet,
      entitlementReconcile: { run: async (now: number) => { calls.push(`reconcile:${now}`); return { examined: 0 }; } },
      uninstallProbe: { run: async () => { calls.push("probe"); return { examined: 0 }; } },
      campaignWatchdog: { run: async () => ({ restarted: 0 }) },
      memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
    };
    await runScheduledSweeps(700, deps, { includeDailyMaintenance: false });
    expect(calls).toEqual(["reconcile:700", "probe"]);
    calls.length = 0;
    await runScheduledSweeps(800, deps);
    expect(calls).toEqual(["reconcile:800", "probe"]);
  });

  it("logs what it settled", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await runScheduledSweeps(1, {
        ...quiet,
        entitlementReconcile: { run: async () => ({ examined: 3, released: 3 }) },
        uninstallProbe: { run: async () => ({ examined: 0 }) },
        campaignWatchdog: { run: async () => ({ restarted: 0 }) },
        memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
      }, { includeDailyMaintenance: false });
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/"sweep":"entitlement_reconcile".*"released":3/));
    } finally {
      log.mockRestore();
    }
  });

  it("a failing reconcile does not stop the probe or fail the tick", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const calls: string[] = [];
    try {
      await expect(runScheduledSweeps(1, {
        ...quiet,
        entitlementReconcile: { run: async () => { throw new Error("d1 down"); } },
        uninstallProbe: { run: async () => { calls.push("probe"); return { examined: 0 }; } },
        campaignWatchdog: { run: async () => ({ restarted: 0 }) },
        memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
      }, { includeDailyMaintenance: false })).resolves.toBeUndefined();
      expect(calls).toEqual(["probe"]);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('"sweep":"entitlement_reconcile"'));
    } finally {
      error.mockRestore();
    }
  });
});

describe("the campaign watchdog sweep", () => {
  const quiet = {
    tokens: { deleteExpiredBefore: async () => 0 },
    retention: { prune: async () => 0 },
    uploads: { listExpiredUploads: async () => [], deleteUploadObjects: async () => undefined, deleteExpiredUploads: async () => 0 },
    history: { reconcile: async () => ({ status: "succeeded" as const, pages: 0, events: 0 }) },
    entitlementReconcile: { run: async () => ({ examined: 0 }) },
    uninstallProbe: { run: async () => ({ examined: 0 }) },
    memberSeatOverage: { run: async () => ({ policy_off: 1 }) },
  };

  it("runs on every tick, the hourly probe-only one included", async () => {
    const ticks: number[] = [];
    const deps = { ...quiet, campaignWatchdog: { run: async (now: number) => { ticks.push(now); return { restarted: 0 }; } } };
    await runScheduledSweeps(900, deps, { includeDailyMaintenance: false });
    await runScheduledSweeps(901, deps);
    expect(ticks).toEqual([900, 901]);
  });

  it("logs what it restarted, and a failure costs no other sweep its tick", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const failed = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await runScheduledSweeps(1, { ...quiet, campaignWatchdog: { run: async () => ({ restarted: 2 }) } }, { includeDailyMaintenance: false });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('"sweep":"campaign_watchdog","restarted":2'));

      const calls: string[] = [];
      await runScheduledSweeps(2, {
        ...quiet,
        uninstallProbe: { run: async () => { calls.push("probe"); return { examined: 0 }; } },
        campaignWatchdog: { run: async () => { throw new Error("d1 down"); } },
      }, { includeDailyMaintenance: false });
      expect(calls).toEqual(["probe"]);
      expect(failed).toHaveBeenCalledWith(expect.stringContaining('"sweep":"campaign_watchdog"'));
    } finally {
      log.mockRestore();
      failed.mockRestore();
    }
  });
});

describe("the member seat overage sweep", () => {
  const quiet = {
    tokens: { deleteExpiredBefore: async () => 0 },
    retention: { prune: async () => 0 },
    uploads: { listExpiredUploads: async () => [], deleteUploadObjects: async () => undefined, deleteExpiredUploads: async () => 0 },
    history: { reconcile: async () => ({ status: "succeeded" as const, pages: 0, events: 0 }) },
    entitlementReconcile: { run: async () => ({ examined: 0 }) },
    uninstallProbe: { run: async () => ({ examined: 0 }) },
    campaignWatchdog: { run: async () => ({ restarted: 0 }) },
  };

  it("runs on every tick, the hourly probe-only one included, so a deadline is met within about an hour", async () => {
    const ticks: number[] = [];
    const deps = { ...quiet, memberSeatOverage: { run: async (now: number) => { ticks.push(now); return { scanned: 0 }; } } };
    await runScheduledSweeps(900, deps, { includeDailyMaintenance: false });
    await runScheduledSweeps(901, deps);
    expect(ticks).toEqual([900, 901]);
  });

  it("logs its counts, and a failure costs no other sweep its tick", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const failed = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await runScheduledSweeps(1, { ...quiet, memberSeatOverage: { run: async () => ({ trimmed: 2 }) } }, { includeDailyMaintenance: false });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('"sweep":"member_seat_overage","trimmed":2'));

      const calls: string[] = [];
      await runScheduledSweeps(2, {
        ...quiet,
        campaignWatchdog: { run: async () => { calls.push("campaigns"); return { restarted: 0 }; } },
        memberSeatOverage: { run: async () => { throw new Error("d1 down"); } },
      }, { includeDailyMaintenance: false });
      expect(calls).toEqual(["campaigns"]);
      expect(failed).toHaveBeenCalledWith(expect.stringContaining('"sweep":"member_seat_overage"'));
    } finally {
      log.mockRestore();
      failed.mockRestore();
    }
  });
});
