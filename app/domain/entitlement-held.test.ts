import { describe, expect, it } from "vitest";
import { HELD_MAX_AGE_MS, HELD_SWEEP_BATCH, isHeldExpired } from "./entitlement-held";

describe("held entitlement defaults", () => {
  // docs/entitlements.md: a held quota reservation or capacity allocation is normally settled within seconds; thirty
  // minutes is far beyond any request or queue retry, so only a crashed run is still held after it.
  it("treats a held item as crashed after thirty minutes", () => {
    expect(HELD_MAX_AGE_MS).toBe(30 * 60 * 1000);
  });

  it("settles a bounded batch per tick", () => {
    expect(HELD_SWEEP_BATCH).toBe(200);
  });
});

describe("isHeldExpired", () => {
  const created = 1_000_000;

  it("keeps an item younger than the maximum age", () => {
    expect(isHeldExpired(created, created + HELD_MAX_AGE_MS - 1)).toBe(false);
  });

  it("expires an item exactly at the maximum age", () => {
    expect(isHeldExpired(created, created + HELD_MAX_AGE_MS)).toBe(true);
  });

  it("expires an item older than the maximum age", () => {
    expect(isHeldExpired(created, created + HELD_MAX_AGE_MS + 1)).toBe(true);
  });

  it("honours an app's own maximum age", () => {
    expect(isHeldExpired(created, created + 59, 60)).toBe(false);
    expect(isHeldExpired(created, created + 60, 60)).toBe(true);
  });

  it("never expires an item created in the future (clock skew)", () => {
    expect(isHeldExpired(created + 10_000, created)).toBe(false);
  });
});
