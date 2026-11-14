import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { setupTestDatabase } from "~/test/database";
import { outboxEvents } from "~/test/outbox";
import { supportAnnouncing } from "./support-events";
import { createServices } from "./services";

setupTestDatabase();

const SHOP = "tickets-one.myshopify.com";
const OTHER = "tickets-two.myshopify.com";

function pages() {
  const s = createServices(env);
  return { s, support: supportAnnouncing(s.env, s.runtime, s.support) };
}

const ticket = (shop: string, key: string) => ({ shop, shopName: "Shop", merchantEmail: "owner@shop.org", ccEmails: [], category: "bug" as const, subject: "The secret subject", body: "The secret body", submissionKey: key });

describe("the merchant's support pages announce tickets to the portal", () => {
  it("queues an index entry when a ticket is opened: id, status, category and unread, nothing the merchant wrote", async () => {
    const { support } = pages();
    const opened = await support.openTicket(ticket(SHOP, "key-1"));
    expect(opened.ok).toBe(true);
    const [event] = await outboxEvents();
    expect(event).toMatchObject({ type: "support.ticket_updated", accountId: SHOP });
    const row = await env.DB.prepare(`SELECT payload FROM portal_outbox WHERE type = 'support.ticket_updated'`).first();
    const payload = String(row?.["payload"]);
    expect(payload).toContain('"status":"open"');
    expect(payload).toContain('"hasUnread":true');
    expect(payload).not.toContain("secret");
    expect(payload).not.toContain("owner@shop.org");
  });

  it("queues a second entry when the merchant replies, and none for another shop's ticket", async () => {
    const { support } = pages();
    const opened = await support.openTicket(ticket(SHOP, "key-2"));
    if (!opened.ok) throw new Error("ticket not opened");
    await support.replyAsMerchant({ shop: SHOP, shopName: "Shop", ticketId: opened.value.id, body: "more", submissionKey: "reply-1" });
    expect((await outboxEvents()).filter((event) => event.type === "support.ticket_updated").length).toBeGreaterThanOrEqual(1);
    const stranger = await support.replyAsMerchant({ shop: OTHER, shopName: "Other", ticketId: opened.value.id, body: "mine now", submissionKey: "reply-2" });
    expect(stranger.ok).toBe(false);
    expect((await outboxEvents()).filter((event) => event.accountId === OTHER)).toEqual([]);
  });
});
