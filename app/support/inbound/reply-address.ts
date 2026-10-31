const LOCAL_PART = "support";
// Ids are opaque and unguessable; this only bounds what a hostile To can carry.
const TICKET_ID = /^[a-z0-9][a-z0-9-]{7,63}$/;

/** The address a conversation is held at: `support@<domain>`. */
export function supportAddress(domain: string): string {
  return `${LOCAL_PART}@${domain}`.toLowerCase();
}

/**
 * The address a conversation's replies come back to: `support+<id>@<domain>`.
 * It carries the thread, so matching survives a client that drops threading
 * headers.
 */
export function ticketReplyAddress(domain: string, ticketId: string): string {
  return `${LOCAL_PART}+${ticketId}@${domain}`.toLowerCase();
}

/** The ticket id inside a `support+<id>@<domain>` address, or null if it is not one. */
export function ticketIdFromAddress(address: string, domain: string): string | null {
  const lower = address.trim().toLowerCase();
  const prefix = `${LOCAL_PART}+`;
  const suffix = `@${domain.toLowerCase()}`;
  if (!lower.startsWith(prefix) || !lower.endsWith(suffix)) return null;
  const id = lower.slice(prefix.length, lower.length - suffix.length);
  return TICKET_ID.test(id) ? id : null;
}
