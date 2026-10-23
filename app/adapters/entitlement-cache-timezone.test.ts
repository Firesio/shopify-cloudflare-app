import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createEntitlementCache } from "./entitlement-cache.server";

const snapshot = { status: "ACTIVE" as const, planHandle: "pro", revision: 2, timeZone: "Pacific/Auckland" };

describe("entitlement cache and the snapshot's time zone", () => {
  it("round trips a snapshot that names a time zone", async () => {
    const cache = createEntitlementCache(env.SESSION, { now: () => 100_000 });
    await cache.put("zone-roundtrip", { catalogueVersion: 1, snapshot });
    await expect(cache.get("zone-roundtrip")).resolves.toEqual({ catalogueVersion: 1, snapshot });
  });

  it.each([
    ["a number", 5],
    ["an object", { zone: "UTC" }],
    ["null", null],
  ])("treats an entry whose time zone is %s as a miss", async (_name, timeZone) => {
    await env.SESSION.put("entitlements:v1:zone-bad", JSON.stringify({ catalogueVersion: 1, snapshot: { ...snapshot, timeZone }, cachedAt: 100_000 }));
    await expect(createEntitlementCache(env.SESSION, { now: () => 100_000 }).get("zone-bad")).resolves.toBeNull();
  });
});
