import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  type RouteObject,
} from "react-router";
import Subscriptions from "./subscriptions";
import type { SubscriptionHistoryRow } from "~/models/shopify-events.server";

function event(overrides: Partial<SubscriptionHistoryRow> = {}): SubscriptionHistoryRow {
  return {
    id: "evt-1",
    shop: "example.myshopify.com",
    subscriptionId: "gid://shopify/AppSubscription/1",
    status: "ACTIVE",
    planHandle: "todo-pro",
    billingInterval: "EVERY_30_DAYS",
    priceAmount: 1900,
    priceCurrency: "USD",
    occurredAt: 1_700_000_000_000,
    ...overrides,
  };
}

async function render(events: SubscriptionHistoryRow[]) {
  const routes: RouteObject[] = [
    {
      path: "/internal/subscriptions",
      Component: Subscriptions,
      loader: () => ({ events }),
    },
  ];

  const handler = createStaticHandler(routes);
  const context = await handler.query(
    new Request("https://example.test/internal/subscriptions"),
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

  expect(html.length, "rendered nothing — assertions would be vacuous").toBeGreaterThan(200);
  return html;
}

/** The markup of the body row that mentions `text`, so a value is tied to ITS row. */
function rowContaining(html: string, text: string): string {
  const row = html.split("<tr").find((part) => part.includes(text));
  expect(row, `no table row mentions ${text}`).toBeDefined();
  return row ?? "";
}

describe("the internal subscriptions page", () => {
  it("shows the shop, plan, status and date of each event in its own row", async () => {
    const html = await render([
      event(),
      event({ id: "evt-2", shop: "other.myshopify.com", status: "CANCELED", planHandle: null, occurredAt: 1_600_000_000_000 }),
    ]);
    const first = rowContaining(html, "example.myshopify.com");
    expect(first).toContain('href="/internal/shops/example.myshopify.com"');
    expect(first).toContain("todo-pro");
    expect(first).toContain("Active");
    expect(first).toContain("Nov 14, 2023");

    const second = rowContaining(html, "other.myshopify.com");
    expect(second).toContain("Canceled");
    expect(second).toContain("Free");
    expect(second).not.toContain("Active");
  });

  it("leaves the title to the shell header and keeps the description in the table toolbar", async () => {
    const html = await render([event()]);
    expect(html).not.toContain("<h1");
    expect(html).toContain("Every plan change Shopify has told this app about");
  });

  it("offers sorting on the shop, plan and changed columns, and paging", async () => {
    const html = await render([event()]);
    for (const title of ["Shop", "Plan", "Changed"]) {
      expect(html, title).toMatch(new RegExp(`<button[^>]*>${title}<svg`));
    }
    expect(html).toContain("Page 1 of 1");
  });

  it("does not imply Shopify historical events include a price", async () => {
    const html = await render([event()]);
    expect(html).not.toContain(">Price<");
    expect(html).not.toContain("$19.00");
  });

  it("shows an empty state with no history yet", async () => {
    const html = await render([]);
    expect(html).toContain("No subscription activity yet");
  });

  it("renders every documented status with a real label", async () => {
    const statuses: SubscriptionHistoryRow["status"][] = [
      "ACTIVE",
      "CANCELLATION_SCHEDULED",
      "CANCELED",
      "NONE",
      "PENDING",
      "FROZEN",
      "UNKNOWN",
    ];
    const html = await render(statuses.map((status, i) => event({ id: `evt-${i}`, status })));
    for (const label of [
      "Active",
      "Cancellation scheduled",
      "Canceled",
      "Free",
      "Pending",
      "Frozen",
      "Unknown",
    ]) {
      expect(html, label).toContain(label);
    }
  });
});
