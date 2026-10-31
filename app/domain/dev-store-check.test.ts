import { describe, expect, it } from "vitest";
import { DEV_STORE_RECHECK_MS, shouldCheckDevStatus } from "./dev-store-check";

const NOW = 10 * DEV_STORE_RECHECK_MS;

describe("shouldCheckDevStatus", () => {
  it("asks about a shop never asked about, whatever its stored flag", () => {
    expect(shouldCheckDevStatus({ isDevStore: false, checkedAt: null }, NOW)).toBe(true);
    expect(shouldCheckDevStatus({ isDevStore: true, checkedAt: null }, NOW)).toBe(true);
  });

  it("never asks again about a shop that answered as a real store", () => {
    expect(shouldCheckDevStatus({ isDevStore: false, checkedAt: 0 }, NOW)).toBe(false);
    expect(shouldCheckDevStatus({ isDevStore: false, checkedAt: NOW }, NOW)).toBe(false);
  });

  it("asks again about a development store only once the recheck interval has passed", () => {
    expect(shouldCheckDevStatus({ isDevStore: true, checkedAt: NOW - DEV_STORE_RECHECK_MS + 1 }, NOW)).toBe(false);
    expect(shouldCheckDevStatus({ isDevStore: true, checkedAt: NOW - DEV_STORE_RECHECK_MS }, NOW)).toBe(true);
    expect(shouldCheckDevStatus({ isDevStore: true, checkedAt: 0 }, NOW)).toBe(true);
  });
});
