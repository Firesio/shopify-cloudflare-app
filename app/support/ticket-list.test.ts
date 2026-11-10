import { describe, expect, it } from "vitest";
import type { SupportTicketSummary } from "./types";
import { buildTicketList, RECENT_ACTIVITY_MS, TICKET_LIST_LIMIT } from "./ticket-list";

const NOW = 1_800_000_000_000;

const summary = (id: string, over: Partial<SupportTicketSummary> = {}): SupportTicketSummary => ({
  id,
  subject: `Subject ${id}`,
  category: "bug",
  lastAuthor: "merchant",
  closedAt: null,
  lastMessageAt: NOW - 1_000,
  merchantLastReadAt: NOW,
  ...over,
});

describe("buildTicketList", () => {
  it("puts tickets with something new first and keeps the newest-first order inside each group", () => {
    const list = buildTicketList({
      limit: 10,
      now: NOW,
      summaries: [
        summary("read-newest", { lastMessageAt: NOW - 10, merchantLastReadAt: NOW }),
        summary("unread-a", { lastMessageAt: NOW - 20, merchantLastReadAt: NOW - 100, lastAuthor: "staff" }),
        summary("read-older", { lastMessageAt: NOW - 30, merchantLastReadAt: NOW }),
        summary("never-read", { lastMessageAt: NOW - 40, merchantLastReadAt: null, lastAuthor: "staff" }),
      ],
    });
    expect(list.rows.map((row) => row.id)).toEqual(["unread-a", "never-read", "read-newest", "read-older"]);
    expect(list.rows.map((row) => row.unread)).toEqual([true, true, false, false]);
  });

  it("derives the status from the ticket's two facts", () => {
    const list = buildTicketList({
      limit: 10,
      now: NOW,
      summaries: [summary("a"), summary("b", { lastAuthor: "staff" }), summary("c", { closedAt: 5 })],
    });
    expect(list.rows.map((row) => row.status)).toEqual(["open", "answered", "closed"]);
  });

  it("cuts the list at the limit and says there was more, when one extra row was read", () => {
    const summaries = Array.from({ length: TICKET_LIST_LIMIT + 1 }, (_, index) => summary(`t${index}`));
    const list = buildTicketList({ summaries, limit: TICKET_LIST_LIMIT, now: NOW });
    expect(list.rows).toHaveLength(TICKET_LIST_LIMIT);
    expect(list.truncated).toBe(true);
  });

  it("does not claim more exist when the list fits exactly", () => {
    const summaries = Array.from({ length: TICKET_LIST_LIMIT }, (_, index) => summary(`t${index}`));
    expect(buildTicketList({ summaries, limit: TICKET_LIST_LIMIT, now: NOW }).truncated).toBe(false);
    expect(buildTicketList({ summaries: [], limit: TICKET_LIST_LIMIT, now: NOW })).toEqual({ rows: [], truncated: false });
  });

  it("marks recent activity, which is shown with its time, from the clock it was given", () => {
    const list = buildTicketList({
      limit: 10,
      now: NOW,
      summaries: [summary("fresh", { lastMessageAt: NOW - RECENT_ACTIVITY_MS + 1 }), summary("stale", { lastMessageAt: NOW - RECENT_ACTIVITY_MS })],
    });
    expect(list.rows.map((row) => row.recent)).toEqual([true, false]);
  });
});
