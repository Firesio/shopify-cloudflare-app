import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { planMeters } from "@firesio/app/plans";
import { PLANS } from "./core/plans";
import { firesio } from "./firesio.server";
import { setupTestDatabase } from "./test/database";

setupTestDatabase();

describe("the preset, configured as the template configures it", () => {
  it("builds every service from the bindings wrangler.jsonc declares (a missing binding is one error naming it)", () => {
    const services = firesio.services(env);
    expect(services.support).not.toBeNull();
    expect(services.plans).toBe(PLANS.plans);
    expect(Object.keys(services.catalogue.features)).toEqual(Object.keys(PLANS.features));
  });

  it("meters open tickets with the preset's own count, read from the database", async () => {
    const meters = new Map(planMeters(firesio.services(env).catalogue).map((meter) => [meter.key, meter.source]));
    const tickets = meters.get("tickets.max");
    expect(tickets?.kind).toBe("count");
    expect(tickets?.kind === "count" ? await tickets.count("no-tickets.myshopify.com", { now: 0, window: null }) : null).toBe(0);
    expect(meters.get("members.max")).toEqual({ kind: "ceiling" });
  });

  it("serves a shop with no subscription the free plan", async () => {
    const { billing } = firesio.services(env);
    const plan = await billing.effectivePlan("no-plan.myshopify.com");
    expect(plan.ok ? plan.effective.planHandle : null).toBe("free");
  });

  it("erases, on shop/redact, every table of the preset with a shop column (the template adds none of its own)", () => {
    const names = firesio.services(env).purgePlan.deletes.map((table) => table.table);
    expect(names).toContain("shops");
    expect(names).toContain("shop_subscriptions");
  });

  it("exports the entrypoint class the portal binds by name, and Shopify's own app", () => {
    expect(typeof firesio.AdminApi).toBe("function");
    expect(typeof firesio.shopify.authenticate.admin).toBe("function");
  });
});
