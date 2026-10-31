import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { testIds } from "~/test/fake-runtime";
import { fakeNotifier } from "~/test/fake-notifier";
import { SupportRepo } from "~/models/support.server";
import { SupportInboundRepo } from "~/models/support-inbound.server";
import { SupportService } from "./support.server";

const DOMAIN = "vip.firesio.app";
setupTestDatabase();
const run = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

function build() {
  const notifier = fakeNotifier();
  const service = new SupportService({
    repo: new SupportRepo(testIds),
    staff: { recipientsFor: async () => ({ emails: [], devices: [] }) },
    clock: { now: () => 5_000 },
    notifier,
    appUrl: `https://${DOMAIN}`,
    mailDomain: DOMAIN,
    withinRateLimit: async () => true,
    signAttachment: async () => "token",
    log: () => {},
  });
  return { notifier, service, inbound: new SupportInboundRepo(testIds) };
}

describe("replying to a conversation by source", () => {
  it("answers a relay conversation to the asker with the whole reply and a way back", async () => {
    await run(async () => {
      const { notifier, service, inbound } = build();
      const opened = await inbound.open({
        externalId: "relay-1@shopify.com", source: "shopify_relay", shop: null, shopName: "Dev Playground",
        replyAddress: "josh@atelier-studios.com", senderName: "Josh", subject: "Dev Playground has a question",
        body: "Can photos be uploaded?", category: "question", at: 1_000,
      });
      if (opened.status !== "written") throw new Error("expected written");
      const { ticketId } = opened.value;

      const replied = await service.replyAsStaff({ ticketId, staffName: "Sam", body: "Yes, from the Admin app." });
      expect(replied.ok).toBe(true);

      const request = notifier.onlyFor("support_staff_reply");
      expect(request.to).toEqual({ email: "josh@atelier-studios.com" });
      expect(request.dedupeKey).toMatch(/^support-staff-reply:/);
      expect(request.payload).toMatchObject({
        body: "Yes, from the Admin app.",
        from: `support@${DOMAIN}`,
        replyTo: `support+${ticketId}@${DOMAIN}`,
      });
      expect(request.payload).not.toHaveProperty("threadUrl");
      // The relay mail never reached Josh's mailbox, so nothing is quoted yet.
      expect(request.payload).not.toHaveProperty("threadHeaders");
    });
  });

  it("threads the next reply under the mail the customer sent", async () => {
    await run(async () => {
      const { notifier, service, inbound } = build();
      const opened = await inbound.open({
        externalId: "hello@mail.example", source: "email", shop: null, shopName: "Jane",
        replyAddress: "jane@buyer.example", senderName: "Jane", subject: "Help", body: "It broke.", category: "question", at: 1_000,
      });
      if (opened.status !== "written") throw new Error("expected written");

      await service.replyAsStaff({ ticketId: opened.value.ticketId, staffName: "Sam", body: "Try again." });
      expect(notifier.onlyFor("support_staff_reply").payload).toMatchObject({
        threadHeaders: { "In-Reply-To": "<hello@mail.example>", References: "<hello@mail.example>" },
      });
    });
  });

  it("keeps a portal ticket's excerpt and link, and adds the way back by email", async () => {
    await run(async () => {
      const { notifier, service } = build();
      const opened = await service.openTicketAsStaff({
        shop: "alpha.myshopify.com", shopName: "Alpha", merchantEmail: "owner@alpha.test", ccEmails: [],
        category: "bug", subject: "Button", body: "We saw your report.", staffName: "Sam",
      });
      expect(opened.ok).toBe(true);
      const request = notifier.onlyFor("support_staff_reply");
      expect(request.to).toEqual({ email: "owner@alpha.test" });
      expect(request.payload).toMatchObject({ threadUrl: expect.stringContaining("/app/support/") });
      expect(request.payload).not.toHaveProperty("body");
      expect(request.payload).toHaveProperty("replyTo");
    });
  });

  it("sends nothing by email when nobody has an address, and the portal still has the message", async () => {
    await run(async () => {
      const { notifier, service } = build();
      const opened = await service.openTicketAsStaff({
        shop: "alpha.myshopify.com", shopName: "Alpha", merchantEmail: null, ccEmails: [],
        category: "bug", subject: "Button", body: "Hello.", staffName: "Sam",
      });
      expect(opened.ok).toBe(true);
      expect(notifier.forEvent("support_staff_reply")).toHaveLength(0);
    });
  });
});

describe("SupportInboundRepo against D1", () => {
  const input = (externalId: string, over: Partial<{ source: "email" | "shopify_relay"; shop: string | null }> = {}) => ({
    externalId, source: over.source ?? "email", shop: over.shop ?? null, shopName: "Jane",
    replyAddress: "jane@buyer.example", senderName: "Jane", subject: "Help", body: "It broke.",
    category: "question" as const, at: 1_000,
  });

  it("stores a repeated mail id once", async () => {
    await run(async () => {
      const { inbound } = build();
      const first = await inbound.open(input("<Same@Mail.Example>"));
      const second = await inbound.open(input("<same@mail.example>"));
      expect(first.status).toBe("written");
      expect(second.status).toBe("duplicate");
    });
  });

  it("finds a thread by its id and by a message id it holds", async () => {
    await run(async () => {
      const { inbound } = build();
      const opened = await inbound.open(input("held@mail.example"));
      if (opened.status !== "written") throw new Error("expected written");
      const byId = await inbound.findThreads({ ticketIds: [opened.value.ticketId], messageIds: [] });
      const byMessage = await inbound.findThreads({ ticketIds: [], messageIds: ["held@mail.example"] });
      expect(byId.map((thread) => thread.id)).toEqual([opened.value.ticketId]);
      expect(byMessage.map((thread) => thread.id)).toEqual([opened.value.ticketId]);
      expect(byId[0]?.participants).toEqual(["jane@buyer.example"]);
    });
  });

  it("keeps an unassigned thread out of every shop's reach until it is assigned", async () => {
    await run(async () => {
      const { inbound } = build();
      const support = new SupportRepo(testIds);
      const opened = await inbound.open(input("unowned@mail.example"));
      if (opened.status !== "written") throw new Error("expected written");
      const { ticketId } = opened.value;

      expect(await support.find("alpha.myshopify.com", ticketId)).toBeUndefined();
      expect(await support.listForShop("alpha.myshopify.com")).toEqual([]);
      expect(await support.purgeShop("alpha.myshopify.com")).toMatchObject({ rows: 0 });
      expect(await support.findForStaff(ticketId)).toBeDefined();

      expect(await inbound.assignShop(ticketId, "alpha.myshopify.com")).toBe(true);
      expect((await support.find("alpha.myshopify.com", ticketId))?.messages[0]?.shop).toBe("alpha.myshopify.com");
      expect(await support.find("beta.myshopify.com", ticketId)).toBeUndefined();
      // Already owned: a second assignment cannot take it from the first shop.
      expect(await inbound.assignShop(ticketId, "beta.myshopify.com")).toBe(false);
    });
  });

  it("reopens a closed thread when the customer writes again", async () => {
    await run(async () => {
      const { inbound } = build();
      const support = new SupportRepo(testIds);
      const opened = await inbound.open(input("one@mail.example"));
      if (opened.status !== "written") throw new Error("expected written");
      const { ticketId } = opened.value;
      await support.closeAsStaff(ticketId, 2_000);
      await inbound.append(ticketId, { externalId: "two@mail.example", senderName: "Jane", body: "Still broken.", at: 3_000 });
      const thread = await support.findForStaff(ticketId);
      expect(thread?.ticket.closedAt).toBeNull();
      expect(thread?.ticket.lastAuthor).toBe("merchant");
      expect(thread?.messages).toHaveLength(2);
    });
  });
});
