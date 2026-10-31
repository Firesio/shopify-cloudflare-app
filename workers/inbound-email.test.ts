import { describe, expect, it } from "vitest";
import { handleInboundEmail, INBOUND_MAX_BYTES } from "./inbound-email";
import type { ReceiveOutcome } from "../app/services/support-inbox.server";
import type { ParsedMail } from "../app/support/inbound/types";

const HAIR = String.fromCodePoint(0x200a);

function raw(headers: string[], body: string): string {
  return [...headers, "", body].join("\r\n");
}

const RELAY = raw(
  [
    "Authentication-Results: mx.trusted.example; dkim=pass header.i=@shopify.com header.s=m1; spf=pass",
    "From: Shopify <no-reply@shopify.com>",
    "Reply-To: josh.johnson@atelier-studios.com",
    "To: support@vip.firesio.app",
    "Subject: Dev Playground has a question about Repair & Service Ops",
    "Message-ID: <E103008F-18DFE423CE0CCFDC-C2352D16@shopify.com>",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
  ],
  `Dev Playground=E2=80=8A\r\n( https://dev-playground-3getbhj4.myshopify.com )\r\nsent you a message. See it below.\r\n\r\nHi, can he upload photos?\r\n\r\nReply directly to josh.johnson@atelier-studios.com\r\n`,
);

function messageOf(text: string, over: { rawSize?: number } = {}) {
  const rejected: string[] = [];
  const message = {
    from: "no-reply@shopify.com",
    to: "support+abcd1234-ef56@vip.firesio.app",
    rawSize: over.rawSize ?? text.length,
    raw: new Response(text).body ?? new ReadableStream<Uint8Array>(),
    headers: new Headers(),
    setReject: (reason: string) => { rejected.push(reason); },
    forward: async () => ({ messageId: "" }),
    reply: async () => ({ messageId: "" }),
  } satisfies Partial<ForwardableEmailMessage>;
  return { message: message as unknown as ForwardableEmailMessage, rejected };
}

function deps(over: { trusted?: string; receive?: (mail: ParsedMail) => Promise<ReceiveOutcome> } = {}) {
  const received: ParsedMail[] = [];
  const logs: string[] = [];
  return {
    received,
    logs,
    dependencies: {
      receive: over.receive ?? (async (mail: ParsedMail) => { received.push(mail); return { status: "duplicate" } as const; }),
      trustedAuthServerId: over.trusted ?? "mx.trusted.example",
      log: (entry: { event: string; status: string }) => { logs.push(entry.status); },
    },
  };
}

describe("handleInboundEmail", () => {
  it("parses the Shopify relay mail into what the inbox needs", async () => {
    const { message, rejected } = messageOf(RELAY);
    const { received, dependencies } = deps();
    await handleInboundEmail(message, dependencies);
    expect(rejected).toEqual([]);
    const [mail] = received;
    expect(mail?.from.address).toBe("no-reply@shopify.com");
    expect(mail?.replyTo?.address).toBe("josh.johnson@atelier-studios.com");
    expect(mail?.messageId).toBe("<E103008F-18DFE423CE0CCFDC-C2352D16@shopify.com>");
    expect(mail?.recipients).toContain("support+abcd1234-ef56@vip.firesio.app");
    expect(mail?.dkimPassDomains).toEqual(["shopify.com"]);
    expect(mail?.text).toContain(`Dev Playground${HAIR}`);
    expect(mail?.text).toContain("Hi, can he upload photos?");
  });

  it("does not believe an Authentication-Results header from a receiver it does not trust", async () => {
    const { message } = messageOf(RELAY);
    const { received, dependencies } = deps({ trusted: "mx.other.example" });
    await handleInboundEmail(message, dependencies);
    expect(received[0]?.dkimPassDomains).toEqual([]);
  });

  it("trusts no sender when no receiver is configured", async () => {
    const { message } = messageOf(RELAY);
    const { received, dependencies } = deps({ trusted: "" });
    await handleInboundEmail(message, dependencies);
    expect(received[0]?.dkimPassDomains).toEqual([]);
  });

  it("rejects a message too large to read, without parsing it", async () => {
    const { message, rejected } = messageOf(RELAY, { rawSize: INBOUND_MAX_BYTES + 1 });
    const { received, dependencies, logs } = deps();
    await handleInboundEmail(message, dependencies);
    expect(rejected).toEqual(["Message too large"]);
    expect(received).toHaveLength(0);
    expect(logs).toEqual(["too_large"]);
  });

  it("rejects a message with no sender instead of storing it", async () => {
    const { message, rejected } = messageOf(raw(["Subject: no sender", "Message-ID: <x@y>"], "hello"));
    const { received, dependencies } = deps();
    await handleInboundEmail(message, dependencies);
    expect(rejected).toEqual(["Unreadable message"]);
    expect(received).toHaveLength(0);
  });

  it("tells the sender to retry when storing fails, never swallowing the mail", async () => {
    const { message, rejected } = messageOf(RELAY);
    const { dependencies } = deps({ receive: async () => { throw new Error("d1 down"); } });
    await handleInboundEmail(message, dependencies);
    expect(rejected).toEqual(["Temporary failure, please try again later"]);
  });
});
