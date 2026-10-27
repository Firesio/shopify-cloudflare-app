import { describe, expect, it } from "vitest";
import { buildEmail } from "~/emails/registry.server";
import { textBuilders } from "~/wiring/audience.server";
import { SAMPLE_PAYLOADS } from "~/test/notification-payloads";
import { allEvents, supportsChannel } from "../../catalogue";
import type { PayloadByEvent } from "../../payloads";
import { composePushMessage } from "./compose";

const DEVICE = "device-1";

/** The catalogue says which channels carry an event; the builders must say the same, in both directions. */
describe("the push builders agree with the catalogue", () => {
  it.each(allEvents())("%s: push is composable exactly when the catalogue lists it", async (event) => {
    const composed = composePushMessage(event, SAMPLE_PAYLOADS[event], DEVICE);
    if (supportsChannel(event, "push")) await expect(composed).resolves.toMatchObject({ kind: "push", to: DEVICE });
    else await expect(composed).rejects.toThrow(/no push builder/);
  });

  it.each(allEvents())("%s: email is renderable exactly when the catalogue lists it", async (event) => {
    const rendered = buildEmail(event, SAMPLE_PAYLOADS[event], textBuilders);
    if (supportsChannel(event, "email")) await expect(rendered).resolves.toMatchObject({ subject: expect.any(String) });
    else await expect(rendered).rejects.toThrow(/no email template/);
  });
});

describe("what each push says", () => {
  it("announces a new ticket by shop and subject, to the ticket, urgently", async () => {
    const push = await composePushMessage("support_merchant_activity", SAMPLE_PAYLOADS.support_merchant_activity, DEVICE);
    expect(push).toEqual({
      kind: "push",
      to: DEVICE,
      title: "New support ticket · Alpha Store",
      body: "Checkout is broken",
      url: "/internal/support/t-1",
      tag: "ticket:t-1",
      topic: "support_ticket_opened",
      urgency: "high",
      ttlSeconds: 86_400,
    });
  });

  it("says a reply is a reply, shows what the merchant wrote, and files it under the reply topic", async () => {
    const payload: PayloadByEvent["support_merchant_activity"] = { ...SAMPLE_PAYLOADS.support_merchant_activity, isNew: false, excerpt: "Still broken today." };
    const push = await composePushMessage("support_merchant_activity", payload, DEVICE);
    expect(push).toMatchObject({ title: "Merchant reply · Alpha Store", body: "Still broken today.", topic: "support_ticket_reply", tag: "ticket:t-1" });
  });

  it("falls back to the subject for a reply with no excerpt", async () => {
    const payload: PayloadByEvent["support_merchant_activity"] = { ...SAMPLE_PAYLOADS.support_merchant_activity, isNew: false, excerpt: "" };
    expect(await composePushMessage("support_merchant_activity", payload, DEVICE)).toMatchObject({ body: "Checkout is broken" });
  });

  it("announces an install and an uninstall with the shop, linked to the shop, at normal urgency", async () => {
    const installed = await composePushMessage("shop_installed", SAMPLE_PAYLOADS.shop_installed, DEVICE);
    const uninstalled = await composePushMessage("shop_uninstalled", SAMPLE_PAYLOADS.shop_uninstalled, DEVICE);
    expect(installed).toMatchObject({
      title: "New install · Alpha Store",
      body: "alpha.myshopify.com · Oct 15, 2026, 9:30 AM",
      url: "/internal/shops/alpha.myshopify.com",
      tag: "shop:alpha.myshopify.com:installed",
      topic: "shop_installed",
      urgency: "normal",
      ttlSeconds: 3_600,
    });
    expect(uninstalled).toMatchObject({ title: "Uninstall · Alpha Store", topic: "shop_uninstalled", tag: "shop:alpha.myshopify.com:uninstalled", urgency: "normal" });
    // An uninstall must not replace the install it follows at the push service.
    expect(installed.tag).not.toBe(uninstalled.tag);
  });

  it("makes the test a short-lived, urgent message to the notification settings", async () => {
    expect(await composePushMessage("push_test", SAMPLE_PAYLOADS.push_test, DEVICE)).toMatchObject({
      title: "Test notification",
      url: "/internal/notifications",
      urgency: "high",
      ttlSeconds: 60,
    });
  });

  it("always links into the console, however the caller built the link", async () => {
    const payload: PayloadByEvent["shop_installed"] = { ...SAMPLE_PAYLOADS.shop_installed, adminUrl: "https://evil.invalid/phish" };
    expect((await composePushMessage("shop_installed", payload, DEVICE)).url).toBe("/internal/dashboard");
  });
});
