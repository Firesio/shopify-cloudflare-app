import { describe, expect, it } from "vitest";
import type { StaffRecipients } from "~/ports/staff-notifications";
import { fakeNotifier } from "~/test/fake-notifier";
import { announceShopChange, type ShopChange } from "./announce-shop-change";

const SHOP = "alpha.myshopify.com";
// 2026-10-15T09:30:00Z
const AT = Date.UTC(2026, 9, 15, 9, 30);

function setup(recipients: StaffRecipients, name: string | null = "Alpha Store") {
  const notifier = fakeNotifier();
  const asked: string[] = [];
  const ports = {
    notifier,
    recipients: { recipientsFor: async (topic: string) => { asked.push(topic); return recipients; } },
    shopName: async () => name,
    appUrl: "https://app.workmanjsc.vn/",
  };
  return { notifier, asked, ports };
}

const installed: ShopChange = { kind: "installed", shop: SHOP, occasion: "new", occurredAt: AT };
const uninstalled: ShopChange = { kind: "uninstalled", shop: SHOP, occasion: String(AT), occurredAt: AT };

const people: StaffRecipients = {
  emails: [{ adminId: "a1", name: "Ada", email: "ada@workmanjsc.vn" }],
  devices: [
    { subscriptionId: "d1", adminId: "a2" },
    { subscriptionId: "d2", adminId: "a2" },
  ],
};

describe("announceShopChange", () => {
  it("asks the topic that matches what happened", async () => {
    const install = setup(people);
    await announceShopChange(install.ports, installed);
    const uninstall = setup(people);
    await announceShopChange(uninstall.ports, uninstalled);
    expect(install.asked).toEqual(["shop_installed"]);
    expect(uninstall.asked).toEqual(["shop_uninstalled"]);
  });

  it("sends one request per email recipient and one per device, each to exactly one channel", async () => {
    const { notifier, ports } = setup(people);
    await announceShopChange(ports, installed);
    expect(notifier.forEvent("shop_installed").map((request) => request.to)).toEqual([
      { email: "ada@workmanjsc.vn" },
      { push: "d1" },
      { push: "d2" },
    ]);
  });

  it("describes the shop and links to it in the console, whatever the app URL's trailing slash", async () => {
    const { notifier, ports } = setup(people);
    await announceShopChange(ports, uninstalled);
    expect(notifier.forEvent("shop_uninstalled")[0]?.payload).toMatchObject({
      shopName: "Alpha Store",
      shop: SHOP,
      occurredAt: "Oct 15, 2026, 9:30 AM",
      adminUrl: "https://app.workmanjsc.vn/internal/shops/alpha.myshopify.com",
    });
  });

  it("names the shop by its domain when Shopify has not told us a name", async () => {
    const { notifier, ports } = setup(people, null);
    await announceShopChange(ports, installed);
    expect(notifier.forEvent("shop_installed")[0]?.payload).toMatchObject({ shopName: SHOP });
  });

  it("keys every request by the kind, the shop and the occasion, and scopes them to the shop", async () => {
    const { notifier, ports } = setup(people);
    await announceShopChange(ports, installed);
    await announceShopChange(ports, uninstalled);
    expect(new Set(notifier.forEvent("shop_installed").map((request) => request.dedupeKey))).toEqual(new Set([`shop-installed:${SHOP}:new`]));
    expect(new Set(notifier.forEvent("shop_uninstalled").map((request) => request.dedupeKey))).toEqual(new Set([`shop-uninstalled:${SHOP}:${AT}`]));
    expect(notifier.sent.every((request) => request.scope === SHOP)).toBe(true);
  });

  it("sends nothing, and does not even look the shop up, when nobody wants to hear", async () => {
    const { notifier, ports } = setup({ emails: [], devices: [] });
    let looked = 0;
    await announceShopChange({ ...ports, shopName: async () => { looked += 1; return null; } }, installed);
    expect(notifier.sent).toEqual([]);
    expect(looked).toBe(0);
  });

  it("raises when the recipients cannot be read, for its callers to log", async () => {
    const { ports } = setup(people);
    await expect(announceShopChange({ ...ports, recipients: { recipientsFor: async () => { throw new Error("db down"); } } }, installed)).rejects.toThrow("db down");
  });
});
