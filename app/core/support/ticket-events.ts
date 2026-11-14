import type { PortalMessage } from "@firesio/portal-client";
import type { TicketIndexEntry } from "@firesio/support";
import type { Outcome } from "@firesio/portal-contract";
import { idPart } from "../shops/lifecycle";

/** Builds and queues `support.ticket_updated` for one shop's ticket. The sink is the outbox: durable, sent by the cron `drain`. */
export interface TicketEventDeps {
  readonly build: (entry: TicketIndexEntry, shop: string) => Promise<Outcome<PortalMessage>>;
  readonly enqueue: (message: PortalMessage) => Promise<Outcome>;
  readonly log: (entry: Readonly<Record<string, unknown>>) => void;
}

/**
 * Tell the portal a ticket changed: an INDEX entry only (id, derived status, category, unread), never a subject, a body or an address;
 * staff open the ticket with a command. A portal problem is logged and never fails the merchant's request.
 */
export async function announceTicket(deps: TicketEventDeps, entry: TicketIndexEntry | undefined, shop: string): Promise<void> {
  if (entry === undefined) return;
  const built = await deps.build(entry, shop);
  if (!built.ok) return deps.log({ event: "portal.event_invalid", type: "support.ticket_updated", reason: built.reason });
  const sent = await deps.enqueue(built.value);
  if (!sent.ok) deps.log({ event: "portal.event_failed", type: "support.ticket_updated", reason: sent.reason });
}

/** One event per (ticket, last activity): a retried request is the same event. */
export const ticketEventId = (entry: TicketIndexEntry): string => `ticket_${idPart(entry.ticketId)}_${entry.updatedAt}`;
