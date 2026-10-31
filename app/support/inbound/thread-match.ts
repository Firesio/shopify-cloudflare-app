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
 * Whether `from` may add a message to a thread. A `support+<id>@` address is
 * guessable once seen, so a message is accepted only from someone already in the
 * conversation; anyone else goes to the unassigned queue, never into the thread.
 */
export function senderMayPost(participants: readonly string[], from: string): boolean {
  const sender = from.trim().toLowerCase();
  return participants.some((participant) => participant.trim().toLowerCase() === sender);
}
