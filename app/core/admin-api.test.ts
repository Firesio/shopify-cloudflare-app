import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { setupTestDatabase } from "~/test/database";
import { createServices } from "~/wiring/services";
import { billingHandlers, shopsHandlers, type AdminApiDeps } from "./admin-api";
import { recordInstall } from "./shops/lifecycle";

setupTestDatabase();

const SHOP = "admin-one.myshopify.com";
// The real clock: the services read it to resolve the plan a shop is served, so a gift must be live now.
const T0 = Date.now();
const account = (id: string) => ({ kind: "shopify_shop" as const, id });

function deps(): AdminApiDeps {
  const s = createServices(env);
  return { shops: s.shops, grants: s.grants, now: () => T0 };
}

describe("the shops commands", () => {
  it("reports an installed shop as active, and a shop it does not know as an unknown account", async () => {
    await recordInstall(createServices(env).lifecycle, SHOP, T0);
    expect(await shopsHandlers(deps()).getStanding({ account: account(SHOP) })).toEqual({ ok: true, value: { state: "active" } });
    expect(await shopsHandlers(deps()).getStanding({ account: account("nobody.myshopify.com") })).toEqual({ ok: false, reason: "unknown account" });
    expect(await shopsHandlers(deps()).getStanding({ account: { kind: "saas_tenant", id: SHOP } })).toEqual({ ok: false, reason: "unknown account" });
  });

  it("blocks the shop with the reason and who asked, and blocking twice keeps the first reason", async () => {
    await recordInstall(createServices(env).lifecycle, SHOP, T0);
    const first = await shopsHandlers(deps()).blockAccount({ account: account(SHOP), reason: "scam mail", actor: "staff-1" });
    expect(first).toMatchObject({ ok: true, value: { state: "blocked", reason: "scam mail (by staff-1)" } });
    const second = await shopsHandlers(deps()).blockAccount({ account: account(SHOP), reason: "again", actor: "staff-2" });
    expect(second).toMatchObject({ ok: true, value: { state: "blocked", reason: "scam mail (by staff-1)" } });
    expect((await createServices(env).shops.get(SHOP))?.blockedAt).toBe(T0);
  });

  it("does not block a shop it does not know", async () => {
    expect(await shopsHandlers(deps()).blockAccount({ account: account("nobody.myshopify.com"), reason: "x", actor: "a" })).toEqual({ ok: false, reason: "unknown account" });
  });
});

describe("the billing commands", () => {
  it("lists the plans of the plan table with their prices", async () => {
    const result = await billingHandlers(deps()).plans({});
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.value.plans.map((plan) => plan.id)).toEqual(["free", "pro"]);
  });

  it("grants a plan until a date, and the shop is then served it", async () => {
    await recordInstall(createServices(env).lifecycle, SHOP, T0);
    const until = new Date(T0 + 86_400_000).toISOString();
    expect(await billingHandlers(deps()).grantPlan({ account: account(SHOP), planId: "pro", until, reason: "gift", actor: "staff-1" })).toEqual({ ok: true, value: { planId: "pro", until } });
    const plan = await createServices(env).billing.effectivePlan(SHOP);
    expect(plan.ok && plan.effective.planHandle).toBe("pro");
    expect(plan.ok && plan.effective.source).toBe("grant");
  });

  it("refuses an unknown plan, a gift that ends in the past and an unknown shop", async () => {
    await recordInstall(createServices(env).lifecycle, SHOP, T0);
    const grant = (over: { planId?: string; until?: string; id?: string }) => billingHandlers(deps()).grantPlan({ account: account(over.id ?? SHOP), planId: over.planId ?? "pro", ...(over.until === undefined ? {} : { until: over.until }), reason: "r", actor: "a" });
    expect(await grant({ planId: "gold" })).toEqual({ ok: false, reason: "unknown plan" });
    expect(await grant({ until: new Date(T0 - 1).toISOString() })).toMatchObject({ ok: false });
    expect(await grant({ id: "nobody.myshopify.com" })).toEqual({ ok: false, reason: "unknown account" });
  });
});
