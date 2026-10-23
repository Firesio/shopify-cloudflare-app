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
      }, { includeDailyMaintenance: false })).resolves.toBeUndefined();
      expect(calls).toEqual(["probe"]);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('"sweep":"entitlement_reconcile"'));
    } finally {
      error.mockRestore();
    }
  });
});
