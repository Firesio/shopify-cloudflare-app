import { err, ok, type Result } from "~/lib/result";
import type { NormalizedInbound, ParsedMail, SupportSource } from "./types";

/**
 * One strategy per kind of mail that can START a conversation. Adding a mail
 * source is one entry here and one test; `receive` never branches on a source.
 */
export interface MailSource {
  readonly source: SupportSource;
  readonly matches: (mail: ParsedMail) => boolean;
  readonly normalize: (mail: ParsedMail, externalId: string) => Result<NormalizedInbound, "unparseable">;
}

// Hair space, zero-width space/joiner/non-joiner, word joiner, BOM: Shopify
// salts addresses and spacers with them, so they must go before any match.
const INVISIBLE_CODE_POINTS = [0x200a, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x00a0];
const INVISIBLE = new RegExp(`[${INVISIBLE_CODE_POINTS.map((code) => String.fromCodePoint(code)).join("")}]`, "g");
const SHOPIFY_SENDER = "no-reply@shopify.com";
const SHOPIFY_DOMAIN = "shopify.com";
const BODY_START = "sent you a message. See it below.";
const BODY_END = "Reply directly to";
const SHOP_URL = /https:\/\/([a-z0-9][a-z0-9-]*\.myshopify\.com)/i;
const RELAY_SUBJECT = /^(.+) has a question about (.+)$/;

function clean(text: string): string {
  return text.replace(INVISIBLE, (char) => (char === String.fromCodePoint(0x00a0) ? " " : ""));
}

function between(text: string, start: string, end: string): string | null {
  const from = text.indexOf(start);
  if (from === -1) return null;
  const bodyFrom = from + start.length;
  const to = text.indexOf(end, bodyFrom);
  if (to === -1) return null;
  return text.slice(bodyFrom, to).trim();
}

/**
 * The Shopify "has a question about <app>" relay. The mail is FROM Shopify and
 * the person who asked is in Reply-To, so the sender recorded is Reply-To; the
 * shop comes from the text part (the HTML link is a tracking redirect).
 */
const shopifyRelay: MailSource = {
  source: "shopify_relay",
  matches: (mail) =>
    mail.from.address.toLowerCase() === SHOPIFY_SENDER &&
    mail.dkimPassDomains.includes(SHOPIFY_DOMAIN) &&
    mail.replyTo !== null &&
    RELAY_SUBJECT.test(mail.subject),
  normalize: (mail, externalId) => {
    const replyTo = mail.replyTo;
    if (replyTo === null) return err("unparseable", "no_reply_to");
    const text = clean(mail.text);
    const body = between(text, BODY_START, BODY_END);
    if (body === null || body === "") return err("unparseable", "body_markers");
    const subject = RELAY_SUBJECT.exec(mail.subject);
    const shop = SHOP_URL.exec(text);
    return ok({
      source: "shopify_relay",
      externalId,
      senderEmail: replyTo.address.toLowerCase(),
      senderName: replyTo.name,
      shopHint: shop?.[1]?.toLowerCase() ?? null,
      shopName: subject?.[1]?.trim() ?? null,
      subject: mail.subject,
      body,
    });
  },
};

/** The fallback: any other mail is a conversation started by its sender. */
export const PLAIN_EMAIL_SOURCE: MailSource = {
  source: "email",
  matches: () => true,
  normalize: (mail, externalId) => {
    const body = clean(mail.text).trim();
    if (body === "") return err("unparseable", "empty_body");
    return ok({
      source: "email",
      externalId,
      senderEmail: (mail.replyTo ?? mail.from).address.toLowerCase(),
      senderName: (mail.replyTo ?? mail.from).name,
      shopHint: null,
      shopName: null,
      subject: mail.subject,
      body,
    });
  },
};

/** Order matters: specific sources first, the catch-all last. */
export const MAIL_SOURCES: readonly MailSource[] = [shopifyRelay, PLAIN_EMAIL_SOURCE];

/** The first source that claims the mail. `PLAIN_EMAIL_SOURCE` always does. */
export function detectMailSource(mail: ParsedMail): MailSource {
  return MAIL_SOURCES.find((candidate) => candidate.matches(mail)) ?? PLAIN_EMAIL_SOURCE;
}
