import type { SupportCategory } from "~/support/categories";
import { isUnreadFor, statusOf, type SupportStatus } from "~/support/status";
import type { SupportTicketSummary } from "~/support/types";

/** How many tickets the merchant's list shows. One more is read, only to know whether there were more. */
export const TICKET_LIST_LIMIT = 50;

/** Activity newer than this shows its time of day as well as its date: "this morning" matters, "in March" does not. */
export const RECENT_ACTIVITY_MS = 7 * 24 * 60 * 60 * 1000;

export type TicketRow = {
  readonly id: string;
  readonly subject: string;
  readonly category: SupportCategory;
  readonly status: SupportStatus;
  readonly lastMessageAt: number;
  readonly unread: boolean;
  /** Decided where the clock is known, so the server render and the first client render cannot disagree. */
  readonly recent: boolean;
};

export type TicketList = {
  readonly rows: readonly TicketRow[];
  /** More tickets exist than the list shows. */
  readonly truncated: boolean;
};

/**
 * The list as the merchant should read it: tickets with something new first, then the rest, each group newest first.
 *
 * `summaries` arrive newest first and `limit + 1` of them are asked for, so a longer answer than `limit` means the list is
 * cut. The sort is stable, so the database's order holds inside each group.
 */
export function buildTicketList(input: {
  readonly summaries: readonly SupportTicketSummary[];
  readonly limit: number;
  readonly now: number;
}): TicketList {
  const rows = input.summaries.slice(0, input.limit).map((ticket) => ({
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    status: statusOf(ticket),
    lastMessageAt: ticket.lastMessageAt,
    unread: isUnreadFor({ lastMessageAt: ticket.lastMessageAt, lastReadAt: ticket.merchantLastReadAt }),
    recent: input.now - ticket.lastMessageAt < RECENT_ACTIVITY_MS,
  }));
  return {
    rows: [...rows].sort((a, b) => Number(b.unread) - Number(a.unread)),
    truncated: input.summaries.length > input.limit,
  };
}
