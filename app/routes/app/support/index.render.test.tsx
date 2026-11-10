import { describe, it, expect } from "vitest";
import { err, ok } from "~/lib/result";
import { renderRoute } from "~/test/render-route";
import SupportIndex from "./index";

type Ticket = {
  id: string;
  subject: string;
  category: "bug" | "question" | "feature_request" | "billing";
  status: "open" | "answered" | "closed";
  lastMessageAt: number;
  unread: boolean;
  recent: boolean;
};

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: "t1",
  subject: "Checkout is broken",
  category: "bug",
  status: "open",
  lastMessageAt: Date.parse("2026-08-25T00:00:00.000Z"),
  unread: false,
  recent: false,
  ...over,
});

/**
 * The Polaris web components themselves cannot be meaningfully unit-tested —
 * they are custom elements the browser upgrades, and this renders them as inert
 * tags. What IS worth asserting is everything decided before they render: which
 * branch the page takes, which strings it chose, and that no English leaked past
 * `t()`. Layout is verified by hand (@rules/testing.md).
 */
async function render(tickets: Ticket[], locale: "en" | "es" = "en", truncated = false) {
  return renderRoute({
    path: "/app/support",
    Component: SupportIndex,
    loaderData: { tickets: Promise.resolve(ok({ rows: tickets, truncated })) },
    stage: "settled",
    locale,
  });
}

describe("the merchant's ticket list", () => {
  it("shows the empty state, not a table, when there are no tickets", async () => {
    const html = await render([]);

    expect(html).toContain("No tickets yet");
    expect(html).not.toContain("<s-table");
  });

  it("builds the empty state from Polaris s-empty-state with an illustration and says what to do", async () => {
    const html = await render([]);

    expect(html).toContain("<s-empty-state");
    expect(html).toMatch(/<s-box slot="graphic"[^>]*><s-image src="\/illustrations\/support-empty.svg"/);
    expect(html).toContain("Use New ticket to report a problem or ask a question.");
  });

  it("does not repeat the page's New ticket action inside the empty state", async () => {
    const html = await render([]);
    const emptyState = /<s-empty-state[\s\S]*<\/s-empty-state>/.exec(html)?.[0] ?? "";

    expect(emptyState).not.toContain("<s-button");
    expect(emptyState).not.toContain("/app/support/new");
    // The one action is the page's own, in the header.
    expect(html.match(/href="\/app\/support\/new"/g)).toHaveLength(1);
  });

  it("shows the table, not the empty state, once a ticket exists", async () => {
    const html = await render([ticket()]);

    expect(html).toContain("<s-table");
    expect(html).not.toContain("No tickets yet");
  });

  it("renders the table full-bleed, with the card supplying no padding", async () => {
    // The table draws its own header rule and row separators; inset inside a
    // padded card it reads as a box floating in a box.
    const html = await render([ticket()]);
    expect(html).toContain('padding="none"');
  });

  it("no longer carries the intro paragraph above the table", async () => {
    const html = await render([ticket()]);
    expect(html).not.toContain("Ask us anything");
  });

  it("labels status by whose turn it is, never a raw enum", async () => {
    const html = await render([ticket({ status: "open" })]);

    expect(html).toContain("Waiting on us");
    expect(html).not.toContain(">open<");
  });

  it("marks an unread ticket, and leaves a read one unmarked", async () => {
    expect(await render([ticket({ unread: true })])).toContain("New");

    const read = await render([
      ticket({ unread: false, subject: "Quiet one" }),
    ]);
    expect(read).toContain("Quiet one");
    expect(read).not.toContain(">New<");
  });

  it("links each row to its own thread", async () => {
    const html = await render([ticket({ id: "abc123" })]);
    expect(html).toContain("/app/support/abc123");
  });

  it("translates the empty state rather than hardcoding English", async () => {
    const html = await render([], "es");

    expect(html).not.toContain("No tickets yet");
    expect(html).not.toContain("New ticket");
    expect(html).toContain("Usa Nuevo ticket");
  });

  it("shows the time of day for recent activity and only the date for old activity", async () => {
    const at = Date.parse("2026-08-25T15:30:00.000Z");
    const recent = await render([ticket({ lastMessageAt: at, recent: true })]);
    const old = await render([ticket({ lastMessageAt: at, recent: false })]);

    expect(recent).toMatch(/Aug 25, 2026,? 3:30\s?PM/);
    expect(old).toContain("Aug 25, 2026");
    expect(old).not.toMatch(/3:30/);
  });

  it("says the list is cut when more tickets exist than it shows", async () => {
    expect(await render([ticket()], "en", true)).toContain("Showing your 50 most recent tickets.");
    expect(await render([ticket()], "en", false)).not.toContain("most recent tickets");
  });
});

const count = (html: string, pattern: string | RegExp) =>
  (html.match(typeof pattern === "string" ? new RegExp(`<${pattern}[\\s>]`, "g") : pattern) ?? []).length;

describe("streaming the ticket list", () => {
  const never = new Promise<never>(() => undefined);
  const pending = (locale: "en" | "es" = "en") =>
    renderRoute({ path: "/app/support", Component: SupportIndex, loaderData: { tickets: never }, stage: "pending", locale });

  it("renders the heading, the New ticket action and the table header at once, with skeleton rows where the tickets go", async () => {
    const html = await pending();

    expect(html).toContain('<s-page heading="Support"');
    expect(html).toContain('slot="primary-action"');
    for (const column of ["Subject", "Type", "Status", "Last activity"]) expect(html).toContain(`>${column}</s-table-header>`);
    expect(count(html, "s-table-row")).toBe(5);
    expect(count(html, "s-table-cell")).toBe(20);
    expect(html).toContain('data-skeleton=""');
    expect(html).not.toContain("<s-spinner");
    // Neither answer is shown before the data arrives.
    expect(html).not.toContain("No tickets yet");
    expect(html).not.toContain("<s-empty-state");
  });

  it("announces the wait once, not once per skeleton", async () => {
    const html = await pending();

    expect(count(html, /accessibilityRole="status"/g)).toBe(1);
    expect(count(html, /Loading your tickets/g)).toBe(2); // the section's label and its one status text
  });

  it("keeps the footprint of a loaded list: the same section, table, header, rows, cells and badges", async () => {
    const loading = await pending();
    const loaded = await render(Array.from({ length: 5 }, (_, index) => ticket({ id: `t${index}`, subject: `Ticket ${index}` })));

    for (const tag of ["s-section", "s-table", "s-table-header-row", "s-table-header", "s-table-body", "s-table-row", "s-table-cell", "s-badge", "s-page", "s-button"]) {
      expect(count(loading, tag), tag).toBe(count(loaded, tag));
    }
    expect(loaded).not.toContain("data-skeleton");
    expect(loaded).not.toContain('accessibilityRole="status"');
  });

  it("replaces the loading state with the rows once the tickets arrive", async () => {
    const html = await render([ticket({ subject: "Refund stuck" })]);
    expect(html).toContain("Refund stuck");
    expect(html).not.toContain("Loading your tickets");
  });

  it("shows a critical banner, not the empty state, when the tickets could not be loaded", async () => {
    // "No tickets yet" would be a plausible but wrong answer for a failed read.
    const html = await renderRoute({
      path: "/app/support",
      Component: SupportIndex,
      loaderData: { tickets: Promise.resolve(err("failed")) },
      stage: "settled",
    });

    expect(html).toContain('tone="critical"');
    expect(html).toContain("We couldn&#x27;t load your tickets");
    expect(html).not.toContain("No tickets yet");
    expect(html).toContain('<s-page heading="Support"');
  });

  it("translates the pending label and keeps the real column headings in the reader's language", async () => {
    const html = await pending("es");
    expect(html).toContain("Cargando tus tickets");
    expect(html).not.toContain("Loading your tickets");
    expect(html).not.toContain(">Subject</s-table-header>");
  });

  it("shows only the failure, with no skeleton rows and no announcement, when the tickets could not be loaded", async () => {
    const html = await renderRoute({ path: "/app/support", Component: SupportIndex, loaderData: { tickets: Promise.resolve(err("failed")) }, stage: "settled" });
    expect(html).not.toContain("data-skeleton");
    expect(html).not.toContain('accessibilityRole="status"');
    expect(html).not.toContain("<s-table");
  });
});
