import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SupportInboundRepo } from "~/models/support-inbound.server";
import { SupportTriageRepo } from "~/models/support-triage.server";
import { runWithRequestContext } from "~/request-context.server";
import { SupportInboxService } from "~/services/support-inbox.server";
import { setupTestDatabase } from "~/test/db";
import { fakeNotifier } from "~/test/fake-notifier";
import { sequentialIds } from "~/test/fake-runtime";
import { fixedTriage } from "~/test/fake-support-triage";
import { quarantineFor } from "~/support/triage/decision";
import type { ParsedMail } from "~/support/inbound/types";
import { SPAM_INTENTS, SPAM_INTENT_HANDLERS, readSpamIntent, type SpamIntent, type SpamIntentFields } from "./spam-intents.server";

setupTestDatabase();

const AT = 1_700_000_000_000;
const NO_FIELDS: SpamIntentFields = { id: "", pattern: "" };

const spamMail = (over: Partial<ParsedMail> = {}): ParsedMail => ({
  messageId: "<s1@spam.example>",
  inReplyTo: null,
  references: [],
  from: { address: "seo@spam.example", name: "SEO" },
  replyTo: null,
  recipients: ["support@vip.firesio.app"],
  subject: "Rank #1",
  text: "Buy links",
  autoSubmitted: null,
  precedence: null,
  ...over,
});

/**
 * The real repositories and the real inbox, with triage deciding everything is spam, so every handler runs against
 * the state a held mail really leaves behind. Only the notifier (the outermost boundary) is a fake.
 */
async function withHeldMail<T>(body: (ctx: Context) => Promise<T>): Promise<T> {
  return runWithRequestContext(env, async () => {
    const ids = sequentialIds("spam");
    const triage = new SupportTriageRepo(ids);
    const inbound = new SupportInboundRepo(ids);
    const inbox = new SupportInboxService({
      repo: inbound,
      triage: fixedTriage(quarantineFor("ai_spam")),
      quarantine: triage,
      shops: { find: async () => null },
      clock: { now: () => AT },
      ids,
      staff: { recipientsFor: async () => ({ emails: [], devices: [] }) },
      notifier: fakeNotifier(),
      appUrl: "https://vip.firesio.app",
      mailDomain: "vip.firesio.app",
      log: () => {},
    });
    const ctx: Context = { inbox, triage, inbound };
    return body(ctx);
  });
}

interface Context {
  readonly inbox: SupportInboxService;
  readonly triage: SupportTriageRepo;
  readonly inbound: SupportInboundRepo;
}

const run = (ctx: Context, intent: SpamIntent, fields: Partial<SpamIntentFields>) =>
  SPAM_INTENT_HANDLERS[intent]({ ...NO_FIELDS, ...fields }, { inbox: ctx.inbox, triage: ctx.triage, actor: "ann@firesio.app", at: AT });

async function heldIds(ctx: Context): Promise<string[]> {
  return (await ctx.triage.listHeld()).map((mail) => mail.id);
}

/** The id of the mail held from one sender: the clock is fixed here, so the list's order says nothing. */
async function heldFrom(ctx: Context, senderEmail: string): Promise<string> {
  const held = (await ctx.triage.listHeld()).find((mail) => mail.senderEmail === senderEmail);
  if (!held) throw new Error(`nothing held from ${senderEmail}`);
  return held.id;
}

describe("releasing held mail", () => {
  it("opens a ticket for it and stops holding it", async () => {
    await withHeldMail(async (ctx) => {
      await ctx.inbox.receive(spamMail());
      const [id] = await heldIds(ctx);

      expect(await run(ctx, "release", { id })).toEqual({ success: "Released. It is now an open ticket." });
      expect(await heldIds(ctx)).toEqual([]);
      expect(await ctx.inbound.findThreads({ ticketIds: [], messageIds: ["s1@spam.example"] })).toHaveLength(1);
    });
  });

  it("says the mail is gone for an id that is not held, and for a second release", async () => {
    await withHeldMail(async (ctx) => {
      await ctx.inbox.receive(spamMail());
      const [id] = await heldIds(ctx);
      await run(ctx, "release", { id });

      expect(await run(ctx, "release", { id })).toEqual({ error: "That mail is already gone." });
      expect(await run(ctx, "release", { id: "never-held" })).toEqual({ error: "That mail is already gone." });
    });
  });
});

describe("deleting held mail", () => {
  it("removes that mail only", async () => {
    await withHeldMail(async (ctx) => {
      await ctx.inbox.receive(spamMail({ messageId: "<a@spam.example>" }));
      await ctx.inbox.receive(spamMail({ messageId: "<b@spam.example>" }));
      const [first, second] = await heldIds(ctx);

      expect(await run(ctx, "discard", { id: first })).toEqual({ success: "Deleted." });
      expect(await heldIds(ctx)).toEqual([second]);
      expect(await run(ctx, "discard", { id: first })).toEqual({ error: "That mail is already gone." });
    });
  });
});

describe("blocking a sender from a held mail", () => {
  it("blocks the mailbox, records who did it, and clears what it already held", async () => {
    await withHeldMail(async (ctx) => {
      await ctx.inbox.receive(spamMail({ messageId: "<a@spam.example>" }));
      await ctx.inbox.receive(spamMail({ messageId: "<b@spam.example>" }));
      await ctx.inbox.receive(spamMail({ messageId: "<c@other.example>", from: { address: "jane@buyer.example", name: "Jane" } }));
      const id = await heldFrom(ctx, "seo@spam.example");

      expect(await run(ctx, "block_sender", { id })).toEqual({ success: "Blocked seo@spam.example." });
      expect(await ctx.triage.listBlocked()).toEqual([{ pattern: "seo@spam.example", createdBy: "ann@firesio.app", createdAt: AT }]);
      expect((await ctx.triage.listHeld()).map((mail) => mail.senderEmail)).toEqual(["jane@buyer.example"]);
    });
  });

  it("blocks nothing for a mail that is gone", async () => {
    await withHeldMail(async (ctx) => {
      expect(await run(ctx, "block_sender", { id: "never-held" })).toEqual({ error: "That mail is already gone." });
      expect(await ctx.triage.patterns()).toEqual([]);
    });
  });
});

describe("the blocklist", () => {
  it("blocks what was typed, normalised, and unblocks it", async () => {
    await withHeldMail(async (ctx) => {
      expect(await run(ctx, "block_pattern", { pattern: "  @Spam.Example " })).toEqual({ success: "Blocked spam.example." });
      expect(await ctx.triage.patterns()).toEqual(["spam.example"]);

      expect(await run(ctx, "unblock", { pattern: "spam.example" })).toEqual({ success: "Unblocked." });
      expect(await ctx.triage.patterns()).toEqual([]);
    });
  });

  it.each(["", "com", "not an address", "a@b"])("refuses to block %j", async (pattern) => {
    await withHeldMail(async (ctx) => {
      expect(await run(ctx, "block_pattern", { pattern })).toEqual({ error: "Enter an email address or a domain, like spam.example." });
      expect(await ctx.triage.patterns()).toEqual([]);
    });
  });
});

describe("reading the submitted intent", () => {
  it.each(SPAM_INTENTS)("accepts %s", (intent) => {
    expect(readSpamIntent(intent)).toBe(intent);
  });

  it.each(["", "Release", "delete_all"])("refuses %j", (value) => {
    expect(readSpamIntent(value)).toBeNull();
  });
});
