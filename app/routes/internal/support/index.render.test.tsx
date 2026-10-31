import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  type RouteObject,
} from "react-router";
import InternalSupport from "./index";

type Row = {
  id: string;
  shop: string | null;
  shopName: string;
  source: "app_portal" | "email";
  subject: string;
  category: "bug" | "question" | "feature_request" | "billing";
  status: "open" | "answered" | "closed";
  lastMessageAt: number;
  planName: string;
  unread: boolean;
};

function row(over: Partial<Row> = {}): Row {
  return {
    id: "t1",
    shop: "alpha.myshopify.com",
    shopName: "Alpha Store",
    source: "app_portal",
    subject: "Checkout is broken",
    category: "bug",
    status: "open",
    lastMessageAt: 1_700_000_000_000,
    planName: "TODO:PRO",
    unread: false,
    ...over,
  };
}

async function render(data: { tickets: Row[] }) {
  const routes: RouteObject[] = [
    { path: "/internal/support", Component: InternalSupport, loader: () => data },
  ];

  const handler = createStaticHandler(routes);
  const context = await handler.query(
    new Request("https://example.test/internal/support"),
  );
  if (context instanceof Response) {
    throw new Error(`Expected a render context, got ${context.status}`);
  }

  const html = renderToString(
    <StaticRouterProvider
      router={createStaticRouter(routes, context)}
      context={context}
    />,
  );

  expect(html.length, "rendered nothing — assertions would be vacuous").toBeGreaterThan(400);
  return html;
}

/** The text of each body row, so a label is asserted in the row it belongs to. */
function bodyRows(html: string): string[] {
  const body = html.match(/<tbody[^>]*>(.*?)<\/tbody>/s)?.[1] ?? "";
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

/** The header cells' text, in column order. */
function headers(html: string): string[] {
  const head = html.match(/<thead[^>]*>(.*?)<\/thead>/s)?.[1] ?? "";
  return [...head.matchAll(/<th[^>]*>(.*?)<\/th>/gs)].map((match) => match[1].replace(/<[^>]+>/g, "").trim());
}

describe("the internal support queue", () => {
  it("shows the shop, subject and the plan that shop is on", async () => {
    // The plan column is the point of this screen: a billing question has to be
    // answerable without opening a second page.
    const html = await render({ tickets: [row()] });
    expect(html).toContain("Checkout is broken");
    expect(html).toContain("Alpha Store");
    expect(html).toContain("TODO:PRO");
  });

  it("labels status by whose turn it is, not by a raw enum", async () => {
    const html = await render({ tickets: [row({ status: "open" })] });
    const [ticket] = bodyRows(html);
    expect(ticket).toContain("Needs reply");
    expect(ticket).not.toMatch(/\bopen\b/);
  });

  it("says a thread is waiting on the merchant once we have replied", async () => {
    const html = await render({
      tickets: [row({ status: "answered" })],
    });
    const [ticket] = bodyRows(html);
    expect(ticket).toContain("Waiting on merchant");
    expect(ticket).not.toContain("Needs reply");
  });

  it("offers the views with a count each, and a way to start a ticket", async () => {
    const html = await render({
      tickets: [row({ id: "a", status: "open" }), row({ id: "b", status: "open" }), row({ id: "c", status: "answered" })],
    });
    const tab = (name: string) => html.match(new RegExp(`<button[^>]*role="tab"[^>]*>${name}<span[^>]*>(\\d+)</span>`))?.[1];
    expect(tab("All")).toBe("3");
    expect(tab("Needs reply")).toBe("2");
    expect(tab("Waiting on merchant")).toBe("1");
    expect(html).toMatch(/<a[^>]*href="\/internal\/support\/new"/);
    expect(bodyRows(html)).toHaveLength(3);
  });

  it("does not repeat the page title in the body — the shell header shows it", async () => {
    const html = await render({ tickets: [row()] });
    expect(html).not.toContain("<h1");
  });

  it("marks an unread thread, and leaves a read one unmarked", async () => {
    const unread = await render({ tickets: [row({ unread: true })] });
    expect(bodyRows(unread)[0]).toMatch(/Checkout is broken New\b/);

    const read = await render({ tickets: [row({ unread: false })] });
    expect(bodyRows(read)[0]).not.toMatch(/\bNew\b/);
  });

  it("falls back to the shop domain when no shop name was captured", async () => {
    const html = await render({
      tickets: [row({ shopName: "" })],
    });
    expect(html).toContain("alpha.myshopify.com");
  });

  it("names where each conversation came from, in the row it belongs to", async () => {
    const html = await render({
      tickets: [
        row({ id: "a", subject: "From the portal", source: "app_portal" }),
        row({ id: "b", subject: "From an email", source: "email", shop: null, shopName: "Jane" }),
      ],
    });
    const rows = bodyRows(html);
    expect(rows.find((text) => text.includes("From the portal"))).toMatch(/\bIn-app\b/);
    expect(rows.find((text) => text.includes("From the portal"))).not.toContain("Unassigned");
    const email = rows.find((text) => text.includes("From an email"));
    expect(email).toMatch(/Jane\s+Unassigned\s+Email/);
  });

  it("shows an empty state in place of rows when nothing is open", async () => {
    const html = await render({ tickets: [] });
    const rows = bodyRows(html);
    // One row: the empty state itself, spanning the table, not a ticket.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("No open tickets");
    expect(rows[0]).not.toContain("Checkout is broken");
  });

  it("lays the columns out in the order the queue is read", async () => {
    const html = await render({ tickets: [row()] });
    expect(headers(html)).toEqual(["Subject", "Shop", "Source", "Plan", "Type", "Status", "Last activity"]);
  });

  it("links to the person's own notification settings instead of holding a switch for them", async () => {
    const html = await render({ tickets: [] });
    // The link is named by its visible text and points at the settings page.
    expect(html).toMatch(/<a[^>]*href="\/internal\/notifications"[^>]*>.*Notification settings.*<\/a>/s);
    // The legacy "email me about tickets" switch is gone: that choice now lives per topic and channel there.
    expect(html).not.toContain("Email me about tickets");
    expect(html).not.toContain('role="switch"');
  });
});
