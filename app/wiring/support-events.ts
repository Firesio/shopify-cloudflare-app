import { buildMessage, enqueue } from "@firesio/portal-client";
import { d1OutboxStore } from "@firesio/portal-client/d1";
import { supportTicketUpdated } from "@firesio/portal-contract";
import type { SupportService } from "@firesio/support";
import { identity } from "~/core/identity";
import { accountOf } from "~/core/shops/lifecycle";
import { announceTicket, ticketEventId, type TicketEventDeps } from "~/core/support/ticket-events";
import { jsonLog, type Runtime } from "./runtime";

function depsOf(env: Env, runtime: Runtime): TicketEventDeps {
  const store = d1OutboxStore(env.DB);
  return {
    build: async (entry, shop) =>
      buildMessage(supportTicketUpdated, identity.slug, {
        eventId: ticketEventId(entry),
        occurredAt: new Date(entry.updatedAt).toISOString(),
        account: accountOf(shop),
        data: { ticketId: entry.ticketId, status: entry.status, category: entry.category, hasUnread: entry.hasUnread },
      }),
    enqueue: (message) => enqueue(store, message, runtime.date),
    log: jsonLog,
  };
}

/** The merchant pages' view of `SupportService`, announcing a ticket to the portal after each write that changes it. Everything else passes through. */
export function supportAnnouncing(env: Env, runtime: Runtime, support: SupportService): Pick<SupportService, "listRecentForShop" | "find" | "markMerchantRead" | "attachmentUrl" | "replyAsMerchant" | "openTicket" | "setCcEmails"> {
  const deps = depsOf(env, runtime);
  return {
    listRecentForShop: (...args) => support.listRecentForShop(...args),
    find: (...args) => support.find(...args),
    markMerchantRead: (...args) => support.markMerchantRead(...args),
    attachmentUrl: (...args) => support.attachmentUrl(...args),
    setCcEmails: (...args) => support.setCcEmails(...args),
    async openTicket(input) {
      const opened = await support.openTicket(input);
      if (opened.ok) await announceTicket(deps, await support.ticketIndexEntry(opened.value.id), input.shop);
      return opened;
    },
    async replyAsMerchant(input) {
      const replied = await support.replyAsMerchant(input);
      if (replied.ok) await announceTicket(deps, await support.ticketIndexEntry(input.ticketId), input.shop);
      return replied;
    },
  };
}
