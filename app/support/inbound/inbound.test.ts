import { describe, expect, it } from "vitest";
import { isAutomatedMail } from "./automated";
import { SOURCE_DELIVERY, replyChannels, replyRecipient } from "./delivery";
import { buildThreadHeaders, referenceableMessageIds } from "./headers";
import { stripQuotedReply } from "./quote";
import { ticketIdFromAddress, ticketReplyAddress } from "./reply-address";
import { detectMailSource } from "./sources";
import { mayAppendTo, senderMayPost, threadLookupKeys } from "./thread-match";
import { senderLabel } from "./sender-label";
import { SUPPORT_SOURCES, toSupportSource, type ParsedMail } from "./types";

const HAIR = String.fromCodePoint(0x200a);
// The text/plain part of the real relay mail, decoded; the hair spaces are the ones Shopify sends.
const RELAY_TEXT = `October 19, 2026

New message about Repair & Service Ops
------------------------------------------

Dev Playground${HAIR}
( https://dev-playground-3getbhj4.myshopify.com )
sent you a message. See it below.

${HAIR}

Hi,

We're looking at using Repair & Service Ops for a client's tool
repair business on Shopify and have a few questions about the
functionality.

1. Mobile access and photographs

- Can he open an existing repair ticket on his mobile?

${HAIR}

Reply directly to josh.johnson@atelier-studios.com

Shopping Bag
`;

function mail(overrides: Partial<ParsedMail> = {}): ParsedMail {
  return {
    messageId: "<E103008F-18DFE423CE0CCFDC-C2352D16@shopify.com>",
    inReplyTo: null,
    references: [],
    from: { address: "no-reply@shopify.com", name: "Shopify" },
    replyTo: { address: "Josh.Johnson@atelier-studios.com", name: "" },
    recipients: ["support@vip.firesio.app"],
    subject: "Dev Playground has a question about Repair & Service Ops",
    text: RELAY_TEXT,
    autoSubmitted: null,
    precedence: null,
    ...overrides,
  };
}

describe("shopify relay source", () => {
  it("claims the relay mail and extracts the asker, shop and message", () => {
    const source = detectMailSource(mail());
    expect(source.source).toBe("shopify_relay");
    const result = source.normalize(mail(), "id-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.senderEmail).toBe("josh.johnson@atelier-studios.com");
    expect(result.value.shopHint).toBe("dev-playground-3getbhj4.myshopify.com");
    expect(result.value.shopName).toBe("Dev Playground");
    expect(result.value.body.startsWith("Hi,")).toBe(true);
    expect(result.value.body).toContain("1. Mobile access and photographs");
    expect(result.value.body).not.toContain("Reply directly to");
    expect(result.value.body).not.toContain(HAIR);
  });

  it("claims the relay without needing DKIM", () => {
    expect(detectMailSource(mail({})).source).toBe("shopify_relay");
  });

  it("does not claim a mail from another sender using the same subject", () => {
    const forged = mail({ from: { address: "attacker@evil.example", name: "Shopify" } });
    expect(detectMailSource(forged).source).toBe("email");
  });

  it("reports unparseable when Shopify changes the template instead of guessing", () => {
    const changed = mail({ text: "Something entirely different" });
    const result = detectMailSource(changed).normalize(changed, "id-1");
    expect(result).toMatchObject({ ok: false, reason: "unparseable" });
  });
});

describe("plain email source", () => {
  const plain = mail({
    from: { address: "Jane@Buyer.example", name: "Jane" },
    replyTo: null,
    subject: "Help please",
    text: "Hello,\n\nit broke.\n",
  });

  it("is the fallback and records the sender", () => {
    const result = detectMailSource(plain).normalize(plain, "id-2");
    expect(result.ok && result.value.source).toBe("email");
    expect(result.ok && result.value.senderEmail).toBe("jane@buyer.example");
    expect(result.ok && result.value.shopHint).toBeNull();
  });

  it("refuses an empty body", () => {
    const empty = mail({ ...plain, text: "  \n " });
    expect(detectMailSource(empty).normalize(empty, "id-3")).toMatchObject({ ok: false });
  });
});

describe("isAutomatedMail", () => {
  it("drops bounces, auto replies and list mail, keeps people", () => {
    const human = mail({ from: { address: "jane@buyer.example", name: "" } });
    expect(isAutomatedMail(human)).toBe(false);
    expect(isAutomatedMail({ ...human, autoSubmitted: "auto-replied" })).toBe(true);
    expect(isAutomatedMail({ ...human, autoSubmitted: "no" })).toBe(false);
    expect(isAutomatedMail({ ...human, precedence: "bulk" })).toBe(true);
    expect(isAutomatedMail({ ...human, from: { address: "MAILER-DAEMON@x.example", name: "" } })).toBe(true);
  });
});

describe("reply address", () => {
  const domain = "vip.firesio.app";
  it("round-trips a ticket id, case-insensitively", () => {
    const address = ticketReplyAddress(domain, "abcd1234-ef56");
    expect(address).toBe("support+abcd1234-ef56@vip.firesio.app");
    expect(ticketIdFromAddress(address.toUpperCase(), domain)).toBe("abcd1234-ef56");
  });

  it("rejects another domain, a missing tag and a hostile id", () => {
    expect(ticketIdFromAddress("support+abcd1234@other.firesio.app", domain)).toBeNull();
    expect(ticketIdFromAddress("support@vip.firesio.app", domain)).toBeNull();
    expect(ticketIdFromAddress("support+a@vip.firesio.app", domain)).toBeNull();
    expect(ticketIdFromAddress("support+../../x1234567@vip.firesio.app", domain)).toBeNull();
  });
});

describe("thread lookup", () => {
  const domain = "vip.firesio.app";
  it("collects ticket ids and answered message ids, newest first, deduped", () => {
    const keys = threadLookupKeys(
      mail({
        recipients: ["support+abcd1234@vip.firesio.app", "support+abcd1234@vip.firesio.app", "x@y.example"],
        inReplyTo: "<B@x>",
        references: ["<A@x>", "<B@x>"],
      }),
      domain,
    );
    expect(keys.ticketIds).toEqual(["abcd1234"]);
    expect(keys.messageIds).toEqual(["b@x", "a@x"]);
  });

  it("still reads the ids a mail answers when there is no mail domain", () => {
    const keys = threadLookupKeys(
      mail({ recipients: ["support+abcd1234@vip.firesio.app"], inReplyTo: "<B@x>", references: ["<A@x>"] }),
      null,
    );
    expect(keys).toEqual({ ticketIds: [], messageIds: ["b@x", "a@x"] });
  });

  it("only lets a participant post into a thread", () => {
    expect(senderMayPost(["Jane@Buyer.example"], "jane@buyer.example")).toBe(true);
    expect(senderMayPost(["jane@buyer.example"], "stranger@evil.example")).toBe(false);
    expect(senderMayPost([], "jane@buyer.example")).toBe(false);
  });
});

describe("buildThreadHeaders", () => {
  it("answers the newest id and lists the chain", () => {
    expect(buildThreadHeaders(["A@x", "<B@x>"])).toEqual({
      "In-Reply-To": "<b@x>",
      References: "<a@x> <b@x>",
    });
  });
  it("adds nothing when there is no known id, and caps the chain", () => {
    expect(buildThreadHeaders([])).toEqual({});
    const many = Array.from({ length: 30 }, (_, i) => `m${i}@x`);
    expect(buildThreadHeaders(many).References?.split(" ")).toHaveLength(20);
  });
});

describe("referenceableMessageIds", () => {
  const messages = [{ externalId: "relay@shopify.com" }, { externalId: null }, { externalId: "theirs@mail.example" }];
  it("leaves out an opening mail that never reached the other side's mailbox", () => {
    expect(referenceableMessageIds("shopify_relay", messages)).toEqual(["theirs@mail.example"]);
  });
  it("keeps the opening mail when the customer sent it themselves", () => {
    expect(referenceableMessageIds("email", messages)).toEqual(["relay@shopify.com", "theirs@mail.example"]);
  });
});

describe("stripQuotedReply", () => {
  it("keeps only what the sender wrote", () => {
    const text = "Thanks, that fixed it.\n\nOn Mon, Oct 19, 2026 at 4:26 PM Support <support@vip.firesio.app> wrote:\n> Did it work?\n";
    expect(stripQuotedReply(text)).toBe("Thanks, that fixed it.");
  });
  it("handles a wrapped attribution line and an Outlook header block", () => {
    expect(stripQuotedReply("Yes.\n\nOn Mon, Oct 19, 2026 at 4:26 PM Someone Long Name\n<a@b.example> wrote:\n> q")).toBe("Yes.");
    expect(stripQuotedReply("Yes.\n\nFrom: Support\nSent: Monday\n")).toBe("Yes.");
  });
  it("leaves an unquoted message whole", () => {
    expect(stripQuotedReply("one\ntwo")).toBe("one\ntwo");
  });
});

describe("source delivery", () => {
  it("has an entry for every source", () => {
    expect(Object.keys(SOURCE_DELIVERY).sort()).toEqual([...SUPPORT_SOURCES].sort());
    expect(toSupportSource("email")).toBe("email");
    expect(toSupportSource("retired")).toBeNull();
  });

  it("answers a portal ticket in the portal and by email", () => {
    const route = { source: "app_portal", replyAddress: null, merchantEmail: "m@shop.example" } as const;
    expect(replyRecipient(route)).toBe("m@shop.example");
    expect(replyChannels(route)).toEqual(["portal", "email"]);
  });

  it("drops email when there is nobody to send it to", () => {
    const route = { source: "app_portal", replyAddress: null, merchantEmail: null } as const;
    expect(replyChannels(route)).toEqual(["portal"]);
    expect(replyChannels({ source: "email", replyAddress: null, merchantEmail: null })).toEqual([]);
  });

  it("answers a relay thread to the asker, not to Shopify", () => {
    const route = { source: "shopify_relay", replyAddress: "josh@atelier-studios.com", merchantEmail: null } as const;
    expect(replyRecipient(route)).toBe("josh@atelier-studios.com");
    expect(SOURCE_DELIVERY.shopify_relay.rootOrigin).toBe("outbound");
    expect(SOURCE_DELIVERY.email.rootOrigin).toBe("inbound");
  });
});

describe("who may add to a thread", () => {
  const thread = { id: "t-1", participants: ["jane@buyer.example"] };
  const none = { ticketIds: [], messageIds: [] };

  it("takes anyone who answered the thread's own reply address", () => {
    expect(mayAppendTo(thread, { ticketIds: ["t-1"], messageIds: [] }, "bruce@buyer.example")).toBe(true);
  });

  it("takes a participant who only quotes a message id, and nobody else", () => {
    const quoted = { ticketIds: [], messageIds: ["m1@mail.example"] };
    expect(mayAppendTo(thread, quoted, "JANE@buyer.example")).toBe(true);
    expect(mayAppendTo(thread, quoted, "stranger@evil.example")).toBe(false);
    expect(mayAppendTo(thread, none, "stranger@evil.example")).toBe(false);
  });

  it("does not let another thread's reply address open this one", () => {
    expect(mayAppendTo(thread, { ticketIds: ["t-2"], messageIds: [] }, "stranger@evil.example")).toBe(false);
  });
});

describe("senderLabel", () => {
  it("writes the name and the address", () => {
    expect(senderLabel({ name: "Customer Service", address: "cs@buyer.example" })).toBe("Customer Service <cs@buyer.example>");
  });

  it("is the address alone when there is no name or the name is the address", () => {
    expect(senderLabel({ name: "", address: "cs@buyer.example" })).toBe("cs@buyer.example");
    expect(senderLabel({ name: "CS@buyer.example", address: "cs@buyer.example" })).toBe("cs@buyer.example");
  });

  it("cannot be made to show a different address through the display name", () => {
    expect(senderLabel({ name: 'Boss <boss@evil.example>"\u202e', address: "cs@buyer.example" })).toBe("Boss boss@evil.example <cs@buyer.example>");
  });

  it("is cut to a sane length", () => {
    expect(senderLabel({ name: "N".repeat(400), address: "cs@buyer.example" }).length).toBe(160);
  });
});
