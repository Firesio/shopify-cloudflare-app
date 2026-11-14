import { env } from "cloudflare:test";
import { ok } from "@firesio/core";
import { createBilling, type SubscriptionObservation, type SubscriptionSource } from "@firesio/plans/billing";
import { describe, expect, it } from "vitest";
import { d1PlanGrants, d1SubscriptionStore } from "~/adapters/d1-billing";
import { PLANS } from "~/core/plans";
import { setupTestDatabase } from "~/test/database";
import { outboxEvents } from "~/test/outbox";
import { createServices } from "~/wiring/services";
import { refreshSubscription } from "./refresh";

setupTestDatabase();

const SHOP = "refresh-one.myshopify.com";
const T0 = 1_700_000_000_000;

function harness(observation: () => SubscriptionObservation) {
  const source: SubscriptionSource = { fetchCurrent: async () => ok(observation()) };
  const billing = createBilling({ plans: PLANS, source, store: d1SubscriptionStore(env.DB, () => T0), grants: d1PlanGrants(env.DB, () => "g", () => T0), now: () => T0 });
  const logged: string[] = [];
  return { deps: { billing, portal: createServices(env).portal, now: () => T0, log: (entry: Readonly<Record<string, unknown>>) => void logged.push(String(entry["event"])) }, logged };
}

const pro = (at: number): SubscriptionObservation => ({ type: "ACTIVE_SUBSCRIPTION", status: "ACTIVE", occurredAt: at, externalId: "sub-1", planHandle: "pro" });

describe("refreshSubscription", () => {
  const shop = { domain: SHOP, shopifyShopId: "gid://shopify/Shop/1" };

  it("stores the subscription and tells the portal when the shop's plan changed", async () => {
    const { deps } = harness(() => pro(T0));
    expect(await refreshSubscription(deps, shop)).toBe("changed");
    const [event] = await outboxEvents();
    expect(event?.type).toBe("subscription.changed");
    const row = await env.DB.prepare(`SELECT payload FROM portal_outbox WHERE type = 'subscription.changed'`).first();
    expect(String(row?.["payload"])).toContain('"planId":"pro"');
    expect(String(row?.["payload"])).toContain('"status":"active"');
  });

  it("says nothing for a read that changes nothing, or an older one", async () => {
    const { deps } = harness(() => pro(T0));
    await refreshSubscription(deps, shop);
    expect(await refreshSubscription(deps, shop)).toBe("unchanged");
    expect(await refreshSubscription(harness(() => pro(T0 - 1)).deps, shop)).toBe("unchanged");
    expect(await outboxEvents()).toHaveLength(1);
  });

  it("reports a source failure as failed, logs it and sends nothing", async () => {
    const { deps, logged } = harness(() => pro(T0));
    const failing = { ...deps, billing: { ...deps.billing, refresh: async () => ({ ok: false as const, reason: "unavailable" as const }) } };
    expect(await refreshSubscription(failing, shop)).toBe("failed");
    expect(logged).toContain("subscription.refresh_failed");
    expect(await outboxEvents()).toEqual([]);
  });

  it("sends the new plan when the merchant moves to another", async () => {
    await refreshSubscription(harness(() => pro(T0)).deps, shop);
    const free: SubscriptionObservation = { type: "ACTIVE_SUBSCRIPTION", status: "ACTIVE", occurredAt: T0 + 5, externalId: "sub-2", planHandle: "free" };
    expect(await refreshSubscription(harness(() => free).deps, shop)).toBe("changed");
    expect((await outboxEvents()).map((event) => event.type)).toEqual(["subscription.changed", "subscription.changed"]);
  });
});
