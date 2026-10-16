import { describe, expect, it } from "vitest";
import type { StaffRecipients } from "~/ports/staff-notifications";
import { fakeNotifier } from "~/test/fake-notifier";
import { announceWebhookDeadLetter, type WebhookDeadLetter } from "./announce-webhook-dead-letter";

const AT = Date.UTC(2026, 9, 15, 9, 30);
const deadLetter: WebhookDeadLetter = { shop: "alpha.myshopify.com", deliveryId: "wh-123", topic: "shop/redact", occurredAt: AT };
const people: StaffRecipients = {
  emails: [{ adminId: "a1", name: "Ada", email: "ada@workmanjsc.vn" }],
  devices: [{ subscriptionId: "d1", adminId: "a2" }],
};

function setup(recipients: StaffRecipients, name: string | null = "Alpha Store") {
  const notifier = fakeNotifier();
  const asked: string[] = [];
  return {
    notifier,
    asked,
    ports: {
      notifier,
      recipients: { recipientsFor: async (topic: string) => { asked.push(topic); return recipients; } },
      shopName: async () => name,
      appUrl: "https://app.workmanjsc.vn/",
    },
  };
}

describe("announceWebhookDeadLetter", () => {
  it("asks the webhook_dead_letter topic and sends one request per email and per device", async () => {
    const { notifier, asked, ports } = setup(people);
    await announceWebhookDeadLetter(ports, deadLetter);
    expect(asked).toEqual(["webhook_dead_letter"]);
    expect(notifier.forEvent("webhook_dead_letter").map((request) => request.to)).toEqual([{ email: "ada@workmanjsc.vn" }, { push: "d1" }]);
  });

  it("describes the delivery by ids and names, and links to the shop in the console", async () => {
    const { notifier, ports } = setup(people);
    await announceWebhookDeadLetter(ports, deadLetter);
    expect(notifier.forEvent("webhook_dead_letter")[0]?.payload).toMatchObject({
      shopName: "Alpha Store", shop: "alpha.myshopify.com", topic: "shop/redact", deliveryId: "wh-123",
      occurredAt: "Oct 15, 2026, 9:30 AM", adminUrl: "https://app.workmanjsc.vn/internal/shops/alpha.myshopify.com",
    });
  });

  it("keys every request by the delivery, so a redelivered message announces once", async () => {
    const { notifier, ports } = setup(people);
    await announceWebhookDeadLetter(ports, deadLetter);
    expect(new Set(notifier.forEvent("webhook_dead_letter").map((request) => request.dedupeKey))).toEqual(new Set(["webhook-dead-letter:wh-123"]));
  });

  it("scopes the request to the shop, so it is erased with the shop's other rows on shop/redact", async () => {
    const { notifier, ports } = setup(people);
    await announceWebhookDeadLetter(ports, deadLetter);
    expect(notifier.forEvent("webhook_dead_letter").every((request) => request.scope === "alpha.myshopify.com")).toBe(true);
  });

  it("falls back to the domain when the shop has no name yet, and sends nothing when nobody asked to hear", async () => {
    const named = setup(people, null);
    await announceWebhookDeadLetter(named.ports, deadLetter);
    expect(named.notifier.forEvent("webhook_dead_letter")[0]?.payload).toMatchObject({ shopName: "alpha.myshopify.com" });

    const nobody = setup({ emails: [], devices: [] });
    await announceWebhookDeadLetter(nobody.ports, deadLetter);
    expect(nobody.notifier.forEvent("webhook_dead_letter")).toEqual([]);
  });
});
