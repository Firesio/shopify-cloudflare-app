import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { sequentialIds } from "~/test/fake-runtime";
import { fakeNotifier } from "~/test/fake-notifier";
import { SupportRepo } from "~/models/support.server";
import { SupportInboundRepo } from "~/models/support-inbound.server";
import { SupportTriageRepo } from "~/models/support-triage.server";
import type { ParsedMail } from "~/support/inbound/types";
import { SupportInboxService } from "./support-inbox.server";
import { SupportService } from "./support.server";
import { SupportTriageService } from "./support-triage.server";

const DOMAIN = "vip.firesio.app";
const HAIR = String.fromCodePoint(0x200a);
setupTestDatabase();
const run = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

/**
 * The real repositories and use cases, with only the outbound notifier faked.
 * Ids are long enough to be a plausible ticket id: the reply address carries
 * one, and production ids are uuids, not the 6-character `test-1` default.
 */
function build(options: { spamScore?: number | null; withinRateLimit?: boolean } = {}) {
  const testIds = sequentialIds("conversation");
  // One clock that moves, so messages sort in the order they happened.
  let now = 1_000;
  const clock = { now: () => (now += 1_000) };
  const notifier = fakeNotifier();
  const staff = { recipientsFor: async () => ({ emails: [], devices: [] }) };
  const triageRepo = new SupportTriageRepo(testIds);
  const inbox = new SupportInboxService({
    repo: new SupportInboundRepo(testIds),
    // The real triage over the real blocklist; only the model (the outermost boundary) is a stand-in.
    triage: new SupportTriageService({
      blocked: triageRepo,
      withinRateLimit: async () => options.withinRateLimit ?? true,
      scoreSpam: async () => options.spamScore ?? null,
    }),
    quarantine: triageRepo,
    shops: { find: async () => null },
    clock,
    ids: testIds,
    staff,
    notifier,
    appUrl: `https://${DOMAIN}`,
    mailDomain: DOMAIN,
    log: () => {},
  });
  const support = new SupportService({
    repo: new SupportRepo(testIds),
    staff,
    clock,
    notifier,
    appUrl: `https://${DOMAIN}`,
    reviewUrl: null,
    mailDomain: DOMAIN,
    withinRateLimit: async () => true,
    signAttachment: async () => "token",
    log: () => {},
  });
  return { notifier, inbox, support, repo: new SupportRepo(testIds), triageRepo };
}

function mail(overrides: Partial<ParsedMail>): ParsedMail {
  return {
    messageId: "<m1@mail.example>",
    inReplyTo: null,
    references: [],
    from: { address: "jane@buyer.example", name: "Jane" },
    replyTo: null,
    recipients: [`support@${DOMAIN}`],
    subject: "Help please",
    text: "It broke.",
    autoSubmitted: null,
    precedence: null,
    ...overrides,
  };
}

/** What the person would do: answer the mail we sent, at the address we told them to use. */
function answerTo(replyTo: unknown, over: Partial<ParsedMail>): ParsedMail {
  if (typeof replyTo !== "string") throw new Error("the reply carried no way back");
  return mail({ recipients: [replyTo], ...over });
}

function payloadOf(notifier: ReturnType<typeof fakeNotifier>, index: number) {
  const request = notifier.forEvent("support_staff_reply")[index];
  if (!request) throw new Error(`no reply email #${index}`);
  const payload: Record<string, unknown> = { ...request.payload };
  return { to: request.to, payload };
}

describe("a conversation, end to end", () => {
  it("runs email in, staff reply out, customer answer in, staff reply out — in one thread", async () => {
    await run(async () => {
      const { notifier, inbox, support, repo } = build();

      const opened = await inbox.receive(mail({}));
      if (opened.status !== "opened") throw new Error("expected opened");
      const { ticketId } = opened;

      await support.replyAsStaff({ ticketId, staffName: "Sam", body: "Try reinstalling." });
      const first = payloadOf(notifier, 0);
      expect(first.to).toEqual({ email: "jane@buyer.example" });
      expect(first.payload.replyTo).toBe(`support+${ticketId}@${DOMAIN}`);
      expect(first.payload.from).toBe(`support@${DOMAIN}`);
      // Their own mail started the thread, so our reply answers it.
      expect(first.payload.threadHeaders).toEqual({ "In-Reply-To": "<m1@mail.example>", References: "<m1@mail.example>" });

      const answer = answerTo(first.payload.replyTo, {
        messageId: "<m2@mail.example>",
        text: "That worked, thanks!\n\nOn Mon, Oct 19, 2026 at 4:26 PM Support <support@vip.firesio.app> wrote:\n> Try reinstalling.",
      });
      expect(await inbox.receive(answer)).toEqual({ status: "appended", ticketId });
      expect(await inbox.receive(answer)).toEqual({ status: "duplicate" });

      await support.replyAsStaff({ ticketId, staffName: "Sam", body: "Glad to hear it." });
      expect(payloadOf(notifier, 1).payload.threadHeaders).toEqual({
        "In-Reply-To": "<m2@mail.example>",
        References: "<m1@mail.example> <m2@mail.example>",
      });

      const thread = await repo.findForStaff(ticketId);
      expect(thread?.messages.map((message) => [message.author, message.body])).toEqual([
        ["merchant", "It broke."],
        ["staff", "Try reinstalling."],
        ["merchant", "That worked, thanks!"],
        ["staff", "Glad to hear it."],
      ]);
      expect(thread?.ticket.source).toBe("email");
    });
  });

  it("starts a relay conversation with OUR mail, then threads the asker's answer", async () => {
    await run(async () => {
      const { notifier, inbox, support, repo } = build();
      const relay = mail({
        messageId: "<relay-1@shopify.com>",
        from: { address: "no-reply@shopify.com", name: "Shopify" },
        replyTo: { address: "josh@atelier-studios.com", name: "Josh" },
        subject: "Dev Playground has a question about Repair & Service Ops",
        text: `Dev Playground${HAIR}\n( https://dev-playground-3getbhj4.myshopify.com )\nsent you a message. See it below.\n\nCan photos be uploaded?\n\nReply directly to josh@atelier-studios.com\n`,
      });
      const opened = await inbox.receive(relay);
      if (opened.status !== "opened") throw new Error("expected opened");
      expect(opened.source).toBe("shopify_relay");
      const { ticketId } = opened;

      await support.replyAsStaff({ ticketId, staffName: "Sam", body: "Yes, from the Admin app." });
      const first = payloadOf(notifier, 0);
      expect(first.to).toEqual({ email: "josh@atelier-studios.com" });
      expect(first.payload.body).toBe("Yes, from the Admin app.");
      // Shopify's mail never reached Josh's mailbox: there is nothing to quote yet.
      expect(first.payload).not.toHaveProperty("threadHeaders");

      const answer = answerTo(first.payload.replyTo, {
        messageId: "<josh-1@atelier-studios.com>",
        from: { address: "josh@atelier-studios.com", name: "Josh" },
        text: "Great, thanks.",
      });
      expect(await inbox.receive(answer)).toEqual({ status: "appended", ticketId });

      await support.replyAsStaff({ ticketId, staffName: "Sam", body: "Anytime." });
      expect(payloadOf(notifier, 1).payload.threadHeaders).toEqual({
        "In-Reply-To": "<josh-1@atelier-studios.com>",
        References: "<josh-1@atelier-studios.com>",
      });

      const thread = await repo.findForStaff(ticketId);
      expect(thread?.messages.map((message) => message.author)).toEqual(["merchant", "staff", "merchant", "staff"]);
    });
  });

  it("joins an answer from another mailbox to the thread it was addressed to, labelled with who sent it", async () => {
    await run(async () => {
      const { inbox, repo } = build();
      const opened = await inbox.receive(mail({}));
      if (opened.status !== "opened") throw new Error("expected opened");

      const answer = mail({
        messageId: "<evil-1@evil.example>",
        from: { address: "colleague@buyer.example", name: "Customer Service" },
        recipients: [`support+${opened.ticketId}@${DOMAIN}`],
        text: "Answering from the shared mailbox.",
      });
      const outcome = await inbox.receive(answer);
      expect(outcome).toEqual({ status: "appended", ticketId: opened.ticketId });
      const thread = await repo.findForStaff(opened.ticketId);
      expect(thread?.messages.map((message) => message.authorName)).toEqual(["Jane", "Customer Service <colleague@buyer.example>"]);
    });
  });

  describe("spam", () => {
    const SPAMMER = { address: "seo@spam.example", name: "SEO" };

    it("holds a mail the model calls spam, then opens a conversation when staff say it is not", async () => {
      await run(async () => {
        const { notifier, inbox, repo, triageRepo } = build({ spamScore: 0.99 });

        const outcome = await inbox.receive(mail({ from: SPAMMER, subject: "Rank #1", text: "Buy links" }));
        expect(outcome).toEqual({ status: "quarantined", reason: "ai_spam" });
        expect(await repo.listOpenForStaff()).toEqual([]);
        expect(notifier.sent).toEqual([]);

        const [heldMail] = await triageRepo.listHeld();
        if (!heldMail) throw new Error("expected a held mail");
        const released = await inbox.release(heldMail.id);
        if (!released.ok) throw new Error("expected the release to open a ticket");

        expect((await repo.listOpenForStaff()).map((ticket) => ticket.subject)).toEqual(["Rank #1"]);
        expect(await triageRepo.listHeld()).toEqual([]);
      });
    });

    it("refuses a blocked domain before any model is asked, and lets everyone else through", async () => {
      await run(async () => {
        const { inbox, repo, triageRepo } = build({ spamScore: 0.01 });
        await triageRepo.block({ pattern: "spam.example", createdBy: "staff@firesio.app", at: 1 });

        expect(await inbox.receive(mail({ from: SPAMMER }))).toEqual({ status: "quarantined", reason: "blocked_sender" });
        expect(await inbox.receive(mail({ messageId: "<m2@mail.example>" }))).toMatchObject({ status: "opened" });
        expect((await repo.listOpenForStaff()).map((ticket) => ticket.subject)).toEqual(["Help please"]);
      });
    });

    it("holds a sender who is over their allowance", async () => {
      await run(async () => {
        const { inbox } = build({ spamScore: 0.01, withinRateLimit: false });
        expect(await inbox.receive(mail({}))).toEqual({ status: "quarantined", reason: "flood" });
      });
    });

    it("opens the conversation when there is no model, so a customer is never lost to a missing one", async () => {
      await run(async () => {
        const { inbox } = build({ spamScore: null });
        expect(await inbox.receive(mail({}))).toMatchObject({ status: "opened" });
      });
    });
  });
});
