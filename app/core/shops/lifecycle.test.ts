import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { outboxEvents } from "~/test/outbox";
import { setupTestDatabase } from "~/test/database";
import { createServices } from "~/wiring/services";
import { recordInstall, recordUninstall } from "./lifecycle";

setupTestDatabase();

const SHOP = "lifecycle-one.myshopify.com";
const OTHER = "lifecycle-two.myshopify.com";
const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

const deps = () => createServices(env).lifecycle;

describe("recordInstall", () => {
  it("records the shop and tells the portal once, with the row and the event in one batch", async () => {
    expect(await recordInstall(deps(), SHOP, T0)).toBe("installed");
    expect((await createServices(env).shops.get(SHOP))?.relationshipStatus).toBe("INSTALLED");
    expect(await outboxEvents()).toEqual([{ type: "shop.installed", eventId: "install_lifecycle-one_myshopify_com", accountId: SHOP }]);
  });

  it("is a renewal on the next token mint: it stamps the shop and sends nothing", async () => {
    await recordInstall(deps(), SHOP, T0);
    expect(await recordInstall(deps(), SHOP, T0 + HOUR)).toBe("renewal");
    expect(await outboxEvents()).toHaveLength(1);
  });

  it("never reads another shop's row", async () => {
    await recordInstall(deps(), SHOP, T0);
    expect(await recordInstall(deps(), OTHER, T0)).toBe("installed");
    expect((await outboxEvents()).map((event) => event.accountId).sort()).toEqual([SHOP, OTHER]);
  });
});

describe("recordUninstall", () => {
  const uninstall = (shop: string, webhookId: string, occurredAt: number) => recordUninstall(deps(), { shop, webhookId, occurredAt });

  it("applies the uninstall and tells the portal, once per webhook id", async () => {
    await recordInstall(deps(), SHOP, T0);
    expect(await uninstall(SHOP, "w1", T0 + HOUR)).toBe("applied");
    expect(await uninstall(SHOP, "w1", T0 + HOUR)).toBe("stale");
    expect((await outboxEvents()).map((event) => event.type)).toEqual(["shop.installed", "shop.uninstalled"]);
    expect((await createServices(env).shops.get(SHOP))?.relationshipStatus).toBe("UNINSTALLED");
  });

  it("answers unknown_shop for a shop that was never installed, and writes nothing", async () => {
    expect(await uninstall(OTHER, "w2", T0)).toBe("unknown_shop");
    expect(await outboxEvents()).toEqual([]);
  });

  it("revives an uninstalled shop as a reinstall, and ignores an uninstall Shopify sent before it", async () => {
    await recordInstall(deps(), SHOP, T0);
    await uninstall(SHOP, "w3", T0 + HOUR);
    expect(await recordInstall(deps(), SHOP, T0 + 2 * HOUR)).toBe("reinstalled");
    expect(await uninstall(SHOP, "w4", T0 + HOUR + 1)).toBe("stale");
    expect((await createServices(env).shops.get(SHOP))?.relationshipStatus).toBe("REACTIVATED");
    expect((await outboxEvents()).map((event) => event.type)).toEqual(["shop.installed", "shop.uninstalled", "shop.reinstalled"]);
  });
});
