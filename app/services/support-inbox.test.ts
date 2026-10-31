import { describe, expect, it } from "vitest";
import { fakeNotifier } from "~/test/fake-notifier";
import { FakeSupportInbound } from "~/test/fake-support-inbound";
import type { ParsedMail } from "~/support/inbound/types";
import { SupportInboxService } from "./support-inbox.server";

const DOMAIN = "vip.firesio.app";
const HAIR = String.fromCodePoint(0x200a);
const RELAY_TEXT = `New message about Repair & Service Ops

Dev Playground${HAIR}
( https://dev-playground-3getbhj4.myshopify.com )
sent you a message. See it below.

Hi, can the technician upload photos from a phone?

Reply directly to josh.johnson@atelier-studios.com
`;

function mail(overrides: Partial<ParsedMail> = {}): ParsedMail {
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

const relay = (overrides: Partial<ParsedMail> = {}) =>
  mail({
    messageId: "<relay-1@shopify.com>",
    from: { address: "no-reply@shopify.com", name: "Shopify" },
    replyTo: { address: "josh.johnson@atelier-studios.com", name: "Josh" },
    subject: "Dev Playground has a question about Repair & Service Ops",
    text: RELAY_TEXT,
    dkimPassDomains: ["shopify.com"],
    ...overrides,
  });

function setup(knownShops: Record<string, string> = {}, mailDomain: string | null = DOMAIN) {
  const repo = new FakeSupportInbound();
  const notifier = fakeNotifier();
  const service = new SupportInboxService({
    repo,
    shops: { find: async (domain) => (knownShops[domain] ? { shop: domain, name: knownShops[domain] } : null) },
    clock: { now: () => 1_000 },
    ids: { uuid: (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; })() },
    staff: { recipientsFor: async () => ({ emails: [{ adminId: "admin-1", email: "staff@firesio.app", name: "Staff" }], devices: [] }) },
    notifier,
    appUrl: `https://${DOMAIN}`,
    mailDomain,
    log: () => {},
  });
  return { repo, notifier, service };
}

describe("SupportInboxService", () => {
  it("opens a relay conversation addressed to the asker, and tells the staff", async () => {
    const { repo, notifier, service } = setup();
    const outcome = await service.receive(relay());
    expect(outcome).toMatchObject({ status: "opened", source: "shopify_relay" });
    const [thread] = repo.threads;
    expect(thread?.participants).toEqual(["josh.johnson@atelier-studios.com"]);
    expect(thread?.shop).toBeNull();
    expect(thread?.messages[0]?.body.startsWith("Hi, can the technician")).toBe(true);
    expect(notifier.onlyFor("support_merchant_activity").payload).toMatchObject({ isNew: true, shopName: "Dev Playground" });
  });

  it("gives the conversation to the shop it names when that shop is known", async () => {
    const { repo, service } = setup({ "dev-playground-3getbhj4.myshopify.com": "Dev Playground Store" });
    await service.receive(relay());
    expect(repo.threads[0]?.shop).toBe("dev-playground-3getbhj4.myshopify.com");
  });

  it("stores a repeated mail once and alerts once", async () => {
    const { repo, notifier, service } = setup();
    await service.receive(relay());
    const again = await service.receive(relay());
    expect(again).toEqual({ status: "duplicate" });
    expect(repo.threads).toHaveLength(1);
    expect(notifier.sent).toHaveLength(1);
  });

  it("adds a participant's answer to the thread named by the reply address", async () => {
    const { repo, notifier, service } = setup();
    const opened = await service.receive(mail());
    if (opened.status !== "opened") throw new Error("expected opened");
    const answer = await service.receive(
      mail({
        messageId: "<m2@mail.example>",
        recipients: [`support+${opened.ticketId}@${DOMAIN}`],
        text: "Thanks!\n\nOn Mon, Oct 19, 2026 at 4:26 PM Support <support@vip.firesio.app> wrote:\n> hi",
      }),
    );
    expect(answer).toEqual({ status: "appended", ticketId: opened.ticketId });
    expect(repo.threads).toHaveLength(1);
    expect(repo.threads[0]?.messages.map((message) => message.body)).toEqual(["It broke.", "Thanks!"]);
    expect(notifier.forEvent("support_merchant_activity")).toHaveLength(2);
  });

  it("follows In-Reply-To when the client dropped the reply address", async () => {
    const { repo, service } = setup();
    await service.receive(mail());
    const answer = await service.receive(mail({ messageId: "<m2@mail.example>", inReplyTo: "<m1@mail.example>", text: "More." }));
    expect(answer.status).toBe("appended");
    expect(repo.threads).toHaveLength(1);
  });

  it("follows In-Reply-To locally, where there is no mail domain", async () => {
    const { repo, service } = setup({}, null);
    await service.receive(mail());
    const answer = await service.receive(mail({ messageId: "<m2@mail.example>", inReplyTo: "<m1@mail.example>", text: "More." }));
    expect(answer.status).toBe("appended");
    expect(repo.threads).toHaveLength(1);
  });

  it("never lets a stranger write into someone else's thread", async () => {
    const { repo, service } = setup();
    const opened = await service.receive(mail());
    if (opened.status !== "opened") throw new Error("expected opened");
    const forged = await service.receive(
      mail({
        messageId: "<x@evil.example>",
        from: { address: "stranger@evil.example", name: "X" },
        recipients: [`support+${opened.ticketId}@${DOMAIN}`],
        text: "Inject",
      }),
    );
    expect(forged.status).toBe("opened");
    expect(repo.threads).toHaveLength(2);
    expect(repo.threads[0]?.messages).toHaveLength(1);
  });

  it("drops automated mail, our own domain and mail with no id", async () => {
    const { repo, notifier, service } = setup();
    expect(await service.receive(mail({ autoSubmitted: "auto-replied" }))).toEqual({ status: "ignored", reason: "automated" });
    expect(await service.receive(mail({ from: { address: `support@${DOMAIN}`, name: "" } }))).toEqual({ status: "ignored", reason: "own_domain" });
    expect(await service.receive(mail({ messageId: null }))).toEqual({ status: "ignored", reason: "no_message_id" });
    expect(repo.threads).toHaveLength(0);
    expect(notifier.sent).toHaveLength(0);
  });

  it("opens a form conversation addressed to the visitor, and ignores a shop it does not know", async () => {
    const { repo, notifier, service } = setup({ "alpha.myshopify.com": "Alpha" });
    const known = await service.submitForm({ name: "Ada", email: "Ada@Buyer.example", subject: "Hi", message: "Question", shop: "alpha.myshopify.com" });
    const unknown = await service.submitForm({ name: "Bob", email: "bob@buyer.example", subject: "Hi", message: "Question", shop: "nowhere.myshopify.com" });
    expect(repo.threads.map((thread) => [thread.id, thread.shop, thread.source, thread.participants[0]])).toEqual([
      [known.ticketId, "alpha.myshopify.com", "web_form", "ada@buyer.example"],
      [unknown.ticketId, null, "web_form", "bob@buyer.example"],
    ]);
    expect(notifier.forEvent("support_merchant_activity")).toHaveLength(2);
  });

  it("assigns an unassigned thread to a known shop, and nothing else", async () => {
    const { repo, service } = setup({ "alpha.myshopify.com": "Alpha" });
    const opened = await service.receive(mail());
    if (opened.status !== "opened") throw new Error("expected opened");
    expect(await service.assignShop(opened.ticketId, "nowhere.myshopify.com")).toMatchObject({ ok: false, reason: "unknown_shop" });
    expect(await service.assignShop(opened.ticketId, "Alpha.myshopify.com")).toEqual({ ok: true, value: null });
    expect(repo.threads[0]?.shop).toBe("alpha.myshopify.com");
    expect(await service.assignShop(opened.ticketId, "alpha.myshopify.com")).toMatchObject({ ok: false, reason: "not_assignable" });
  });

  it("keeps what a person wrote when the relay template no longer parses", async () => {
    const { repo, service } = setup();
    const outcome = await service.receive(relay({ text: "Something Shopify changed." }));
    expect(outcome).toMatchObject({ status: "opened", source: "email" });
    expect(repo.threads[0]?.messages[0]?.body).toBe("Something Shopify changed.");
  });
});
