import PostalMime, { type Address, type Mailbox } from "postal-mime";
import { dkimPassDomains } from "~/support/inbound/authentication";
import type { MailAddress, ParsedMail } from "~/support/inbound/types";

function mailbox(address: Address | undefined): Mailbox | null {
  return address !== undefined && address.address !== undefined ? address : null;
}

function toMailAddress(address: Address | undefined): MailAddress | null {
  const found = mailbox(address);
  return found === null ? null : { address: found.address, name: found.name };
}

function addressesOf(list: readonly Address[] | undefined): string[] {
  return (list ?? []).flatMap((entry) => {
    const found = mailbox(entry);
    return found === null ? [] : [found.address.toLowerCase()];
  });
}

function headerValue(headers: readonly { readonly key: string; readonly value: string }[], key: string): string | null {
  return headers.find((header) => header.key === key)?.value ?? null;
}

export interface InboundEnvelope {
  /** The envelope recipient: the address the mail was really sent to. */
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
  /** The authserv-id of the receiver whose `Authentication-Results` is trusted; empty trusts none. */
  readonly trustedAuthServerId: string;
}

/**
 * Parse a received message into what the support decisions need. Null for a
 * message with no usable sender, which the caller refuses.
 *
 * The envelope recipient is included alongside the header recipients because a
 * mail sent to `support+<id>@…` through a forward or a Bcc may not name that
 * address in To at all.
 */
export async function parseInboundMail(envelope: InboundEnvelope): Promise<ParsedMail | null> {
  const email = await PostalMime.parse(envelope.raw);
  const from = toMailAddress(email.from);
  if (from === null) return null;

  return {
    messageId: email.messageId ?? null,
    inReplyTo: email.inReplyTo ?? null,
    references: (email.references ?? "").split(/\s+/).filter((id) => id !== ""),
    from,
    replyTo: toMailAddress(email.replyTo?.[0]),
    recipients: [...new Set([envelope.to.toLowerCase(), ...addressesOf(email.to), ...addressesOf(email.cc)])],
    subject: email.subject ?? "",
    text: email.text ?? "",
    autoSubmitted: headerValue(email.headers, "auto-submitted"),
    precedence: headerValue(email.headers, "precedence"),
    dkimPassDomains: dkimPassDomains(email.headers, envelope.trustedAuthServerId),
  };
}
