import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { sequentialIds } from "~/test/fake-runtime";
import { fakeNotifier } from "~/test/fake-notifier";
import { SupportRepo } from "~/models/support.server";
import { SupportInboundRepo } from "~/models/support-inbound.server";
import type { ParsedMail } from "~/support/inbound/types";
import { SupportInboxService } from "./support-inbox.server";
import { SupportService } from "./support.server";

const DOMAIN = "vip.firesio.app";
const HAIR = String.fromCodePoint(0x200a);
setupTestDatabase();
const run = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

/**
 * The real repositories and use cases, with only the outbound notifier faked.
 * Ids are long enough to be a plausible ticket id: the reply address carries
 * one, and production ids are uuids, not the 6-character `test-1` default.
 */
function build() {
  const testIds = sequentialIds("conversation");
  // One clock that moves, so messages sort in the order they happened.
  let now = 1_000;
  const clock = { now: () => (now += 1_000) };
  const notifier = fakeNotifier();
  const staff = { recipientsFor: async () => ({ emails: [], devices: [] }) };
  const inbox = new SupportInboxService({
    repo: new SupportInboundRepo(testIds),
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
    mailDomain: DOMAIN,
    withinRateLimit: async () => true,
    signAttachment: async () => "token",
    log: () => {},
  });
  return { notifier, inbox, support, repo: new SupportRepo(testIds) };
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
    dkimPassDomains: [],
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
        dkimPassDomains: ["shopify.com"],
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

  it("keeps a stranger who guessed the reply address out of the thread", async () => {
    await run(async () => {
      const { inbox, repo } = build();
      const opened = await inbox.receive(mail({}));
      if (opened.status !== "opened") throw new Error("expected opened");

      const forged = mail({
        messageId: "<evil-1@evil.example>",
        from: { address: "stranger@evil.example", name: "X" },
        recipients: [`support+${opened.ticketId}@${DOMAIN}`],
        text: "Inject this.",
      });
      const outcome = await inbox.receive(forged);
      expect(outcome.status).toBe("opened");
      const thread = await repo.findForStaff(opened.ticketId);
      expect(thread?.messages).toHaveLength(1);
    });
  });
});
