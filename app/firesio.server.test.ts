import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { identity } from "~/core/identity";
import { PLANS } from "~/core/plans";
import { firesio } from "./firesio.server";
import { setupTestDatabase } from "./test/database";

setupTestDatabase();

describe("the preset, configured as the template configures it", () => {
  it("builds every service from the bindings wrangler.jsonc declares (a missing binding is one error naming it)", () => {
    const services = firesio.services(env);
    expect(services.support).not.toBeNull();
    expect(services.plans).toBe(PLANS);
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

  it("reports the app under the slug the portal declares it by (declared-apps.ts)", () => {
    expect(identity.slug).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("exports the entrypoint class the portal binds by name, and Shopify's own app", () => {
    expect(typeof firesio.AdminApi).toBe("function");
    expect(typeof firesio.shopify.authenticate.admin).toBe("function");
  });
});
