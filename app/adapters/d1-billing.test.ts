import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SubscriptionObservation } from "@firesio/plans/billing";
import { setupTestDatabase } from "~/test/database";
import { d1PlanGrants, d1SubscriptionStore } from "./d1-billing";

setupTestDatabase();

const SHOP = "billing-one.myshopify.com";
const OTHER = "billing-two.myshopify.com";
const T0 = 1_700_000_000_000;
const store = () => d1SubscriptionStore(env.DB, () => T0);

const active = (occurredAt: number, externalId: string, planHandle: string): SubscriptionObservation => ({ type: "ACTIVE_SUBSCRIPTION", status: "ACTIVE", occurredAt, externalId, planHandle });

describe("the subscription projection", () => {
  it("stores the first observation and reads it back", async () => {
    expect(await store().upsert(SHOP, active(T0, "a", "pro"))).toBe("applied");
    expect(await store().read(SHOP)).toMatchObject({ status: "ACTIVE", planHandle: "pro", appliedOccurredAt: T0, appliedExternalId: "a" });
  });

  it("orders by time then id: a newer one wins, an older one is stale, the same one is a duplicate", async () => {
    await store().upsert(SHOP, active(T0 + 10, "b", "pro"));
    expect(await store().upsert(SHOP, active(T0, "a", "free"))).toBe("stale");
    expect(await store().upsert(SHOP, active(T0 + 10, "b", "pro"))).toBe("duplicate");
    expect(await store().upsert(SHOP, active(T0 + 20, "c", "free"))).toBe("applied");
    expect((await store().read(SHOP))?.planHandle).toBe("free");
  });

  it("keeps one shop's subscription out of another's reads", async () => {
    await store().upsert(SHOP, active(T0, "a", "pro"));
    expect(await store().read(OTHER)).toBeNull();
  });
});

describe("plan grants", () => {
  const grants = () => d1PlanGrants(env.DB, () => "grant-1", () => T0);
  const grant = { planHandle: "pro", reason: "support gift", grantedBy: "staff-1", startsAt: T0, expiresAt: T0 + 1_000, revokedAt: null };

  it("finds the active grant of the shop, not another's, and not after it expires", async () => {
    await grants().create(SHOP, grant);
    expect((await grants().findActive(SHOP, T0 + 1))?.planHandle).toBe("pro");
    expect(await grants().findActive(OTHER, T0 + 1)).toBeNull();
    expect(await grants().findActive(SHOP, T0 + 1_000)).toBeNull();
  });

  it("revokes once, and only for the shop that owns the grant", async () => {
    await grants().create(SHOP, grant);
    expect(await grants().revoke(OTHER, "grant-1", "staff-2", T0 + 1)).toBe(false);
    expect(await grants().revoke(SHOP, "grant-1", "staff-2", T0 + 1)).toBe(true);
    expect(await grants().revoke(SHOP, "grant-1", "staff-2", T0 + 2)).toBe(false);
    expect(await grants().findActive(SHOP, T0 + 1)).toBeNull();
  });
});
