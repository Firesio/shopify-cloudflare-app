import { describe, expect, it } from "vitest";
import { DEV_STORE_RECHECK_MS } from "~/domain/dev-store-check";
import { syncDevStoreStatus, type DevStoreStatusPorts } from "./sync-dev-store-status";
import type { StoredDevStatus } from "~/domain/dev-store-check";

const NOW = 10 * DEV_STORE_RECHECK_MS;

function run(stored: StoredDevStatus | null, answer: boolean | null) {
  const calls: string[] = [];
  const ports: DevStoreStatusPorts = {
    stored: async () => stored,
    fetch: async () => {
      calls.push("fetch");
      return answer;
    },
    record: async (_shop, isDevStore, at) => void calls.push(`record:${isDevStore}@${at}`),
    unavailable: async () => void calls.push("unavailable"),
    changed: async (_shop, isDevStore) => void calls.push(`changed:${isDevStore}`),
  };
  return { calls, result: syncDevStoreStatus("a.myshopify.com", NOW, ports) };
}

describe("syncDevStoreStatus", () => {
  it("records and announces a first check that finds a development store", async () => {
    const { calls, result } = run({ isDevStore: false, checkedAt: null }, true);
    await expect(result).resolves.toBe("changed");
    expect(calls).toEqual(["fetch", `record:true@${NOW}`, "changed:true"]);
  });

  it("records the check time without announcing when the first check finds a real store", async () => {
    const { calls, result } = run({ isDevStore: false, checkedAt: null }, false);
    await expect(result).resolves.toBe("unchanged");
    expect(calls).toEqual(["fetch", `record:false@${NOW}`]);
  });

  it("does not ask Shopify about a real store that was already checked", async () => {
    const { calls, result } = run({ isDevStore: false, checkedAt: 1 }, true);
    await expect(result).resolves.toBe("skipped");
    expect(calls).toEqual([]);
  });

  it("does not ask Shopify about a development store checked recently", async () => {
    const { calls, result } = run({ isDevStore: true, checkedAt: NOW - 1 }, false);
    await expect(result).resolves.toBe("skipped");
    expect(calls).toEqual([]);
  });

  it("flips a development store that moved to a paid plan", async () => {
    const { calls, result } = run({ isDevStore: true, checkedAt: 0 }, false);
    await expect(result).resolves.toBe("changed");
    expect(calls).toEqual(["fetch", `record:false@${NOW}`, "changed:false"]);
  });

  it("writes nothing when Shopify cannot answer", async () => {
    const { calls, result } = run({ isDevStore: true, checkedAt: 0 }, null);
    await expect(result).resolves.toBe("unavailable");
    expect(calls).toEqual(["fetch", "unavailable"]);
  });

  it("skips a shop that has no row", async () => {
    const { calls, result } = run(null, true);
    await expect(result).resolves.toBe("skipped");
    expect(calls).toEqual([]);
  });
});
