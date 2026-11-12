import { ticketIdFromAddress } from "./reply-address";
import type { ParsedMail } from "./types";

/** What to look up to find the thread a mail belongs to, best evidence first. */
export interface ThreadLookupKeys {
  /** Ids read from `support+<id>@` recipients: the strongest evidence. */
  readonly ticketIds: readonly string[];
  /** Message-IDs this mail answers (In-Reply-To, then References, newest first). */
  readonly messageIds: readonly string[];
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

export function normalizeMessageId(value: string): string {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

/**
 * With no mail domain (local development) there are no `support+<id>@`
 * addresses to read, but a client that kept the threading headers can still be
 * matched by the ids it answers.
 */
export function threadLookupKeys(mail: ParsedMail, domain: string | null): ThreadLookupKeys {
  const ticketIds = unique(
    mail.recipients.flatMap((address) => {
      const id = domain === null ? null : ticketIdFromAddress(address, domain);
      return id === null ? [] : [id];
    }),
  );
  const answered = [
    ...(mail.inReplyTo === null ? [] : [mail.inReplyTo]),
    ...[...mail.references].reverse(),
  ].map(normalizeMessageId);
  return { ticketIds, messageIds: unique(answered.filter((id) => id !== "")) };
}

/**
 * Whether `from` is already someone in the conversation (its asker, the merchant's address, a copied address).
 */
export function senderMayPost(participants: readonly string[], from: string): boolean {
  const sender = from.trim().toLowerCase();
  return participants.some((participant) => participant.trim().toLowerCase() === sender);
}

/**
 * Whether a mail may be added to this thread.
 *
 * Two kinds of evidence, and they are not equal:
 *  - the mail was ADDRESSED to the thread's own `support+<id>@`. The id is a random UUID that only people who received our
 *    mail have seen, and the person who answers it is not always the address we wrote to (a colleague, a second mailbox, a
 *    "Customer Service" alias): that was a real conversation split in two. Accepted from any sender.
 *  - the mail merely answers a message id the thread holds (`In-Reply-To`, `References`). Those ids are in every copy and
 *    forward of the customer's own mail, so this is accepted only from someone already in the conversation.
 *
 * What a non-participant's message does NOT get is the merchant's name: it is stored under the sender's own name and
 * address (`senderLabel`), so staff can see who actually wrote it.
 */
export function mayAppendTo(
  thread: { readonly id: string; readonly participants: readonly string[] },
  keys: ThreadLookupKeys,
  from: string,
): boolean {
  return keys.ticketIds.includes(thread.id) || senderMayPost(thread.participants, from);
}
