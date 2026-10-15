import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  type RouteObject,
} from "react-router";
import Dashboard from "./dashboard";

type LoaderData = {
  user: { name: string };
  admins: number;
  stats: {
    totalShops: number;
    paidShops: number;
    freeShops: number;
    mrrByCurrency: { amount: number; currency: string }[];
    shopsByPlan?: Record<string, number>;
  };
  trend: { month: string; installs: number; uninstalls: number; active: number }[];
  health: { failedWebhooks: number; deadLetterWebhooks: number; lifecycleEvents: number; subscriptionEvents: number; checkpoint: { lastSucceededAt: number | null; lastFailedAt: number | null } | null };
  uninstallFeedback?: {
    eventId: string;
    shop: string;
    shopName: string | null;
    logoUrl: string | null;
    occurredAt: number;
    reason: string | null;
    reasonDescription: string | null;
  }[];
};

async function render(data: LoaderData) {
  // The loader streams three regions; the fixtures below stay in the flat shape
  // a reader thinks in and are regrouped here exactly as the loader groups them.
  const fullData = {
    user: data.user,
    headline: { admins: data.admins, stats: data.stats, trend: data.trend },
    health: data.health,
    charts: { trend: data.trend, uninstallFeedback: data.uninstallFeedback ?? [] },
  };
  const routes: RouteObject[] = [
    { path: "/internal/dashboard", Component: Dashboard, loader: () => fullData },
  ];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request("https://example.test/internal/dashboard"));
  if (context instanceof Response) {
    throw new Error(`Expected a render context, got ${context.status}`);
  }
  const html = renderToString(
    <StaticRouterProvider router={createStaticRouter(routes, context)} context={context} />,
  );
  expect(html.length, "rendered nothing").toBeGreaterThan(200);
  return html;
}

function expectStat(html: string, label: string, value: string) {
  const labelIndex = html.indexOf(label);
  expect(labelIndex, `missing stat label: ${label}`).toBeGreaterThanOrEqual(0);
  const statMarkup = html.slice(labelIndex, labelIndex + 300);
  expect(statMarkup, `wrong value for ${label}`).toContain(value);
}

describe("the internal dashboard", () => {
  it("shows shop counts and MRR", async () => {
    const html = await render({
      user: { name: "Jamie" },
      admins: 3,
      stats: {
        totalShops: 10,
        paidShops: 4,
        freeShops: 6,
        mrrByCurrency: [{ amount: 7600, currency: "USD" }],
        shopsByPlan: { free: 6, pro: 4 },
      },
      trend: [{ month: "Jan", installs: 2, uninstalls: 0, active: 2 }],
      health: { failedWebhooks: 2, deadLetterWebhooks: 1, lifecycleEvents: 4, subscriptionEvents: 3, checkpoint: { lastSucceededAt: 100, lastFailedAt: null } },
    });
    expectStat(html, "Installed shops", "10");
    expectStat(html, "Paid shops", "4");
    expect(html).toContain("6 shops on a free plan");
    expectStat(html, "Free plan", "6");
    expectStat(html, "Pro plan", "4");
    expect(html).toContain("$76.00");
  });

  it("renders the numbers WITHOUT pulling in the charts", async () => {
    // The charts are a lazy chunk mounted only in the browser, so the server
    // response must already carry the figures a staff member opens this page
    // for. If this ever starts containing chart markup, the split has been
    // undone and recharts is back on the critical path.
    const html = await render({
      user: { name: "Jamie" },
      admins: 3,
      stats: { totalShops: 10, paidShops: 4, freeShops: 6, mrrByCurrency: [] },
      trend: [{ month: "Jan", installs: 2, uninstalls: 1, active: 9 }],
      health: { failedWebhooks: 0, deadLetterWebhooks: 0, lifecycleEvents: 0, subscriptionEvents: 0, checkpoint: null },
    });

    expect(html).toContain("Installed shops");
    expect(html).not.toContain("recharts");
    expect(html).not.toContain("Merchant growth");
  });

  it("shows a zero MRR when nobody has paid yet", async () => {
    const html = await render({
      user: { name: "Jamie" },
      admins: 1,
      stats: { totalShops: 2, paidShops: 0, freeShops: 2, mrrByCurrency: [] },
      trend: [{ month: "Jan", installs: 0, uninstalls: 0, active: 0 }],
      health: { failedWebhooks: 0, deadLetterWebhooks: 0, lifecycleEvents: 0, subscriptionEvents: 0, checkpoint: null },
    });
    expect(html).toContain("$0.00");
  });

  it("shows operational health counts and checkpoint state", async () => {
    const html = await render({
      user: { name: "Jamie" }, admins: 1,
      stats: { totalShops: 1, paidShops: 0, freeShops: 1, mrrByCurrency: [] },
      trend: [],
      health: { failedWebhooks: 2, deadLetterWebhooks: 1, lifecycleEvents: 4, subscriptionEvents: 3, checkpoint: { lastSucceededAt: 100, lastFailedAt: null } },
    });
    expect(html).toContain("Webhook failures");
    expect(html).toContain("Dead-letter webhooks");
    expect(html).toContain("Last sync");
  });

  it("leaves the page title to the shell header: no h1 and no sign-in subtitle in the body", async () => {
    const html = await render({
      user: { name: "Jamie" },
      admins: 1,
      stats: { totalShops: 2, paidShops: 0, freeShops: 2, mrrByCurrency: [] },
      trend: [{ month: "Jan", installs: 0, uninstalls: 0, active: 0 }],
      health: { failedWebhooks: 0, deadLetterWebhooks: 0, lifecycleEvents: 0, subscriptionEvents: 0, checkpoint: null },
    });
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("Signed in as");
  });

  it("puts the trend icon after the footer headline only on cards that have a trend", async () => {
    const html = await render({
      user: { name: "Jamie" },
      admins: 1,
      stats: { totalShops: 12, paidShops: 4, freeShops: 8, mrrByCurrency: [] },
      trend: [
        { month: "Jan", installs: 4, uninstalls: 1, active: 10 },
        { month: "Feb", installs: 5, uninstalls: 3, active: 12 },
      ],
      health: { failedWebhooks: 0, deadLetterWebhooks: 0, lifecycleEvents: 0, subscriptionEvents: 0, checkpoint: null },
    });
    const card = (from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to));
    const installed = card("Installed shops", "Paid shops");
    const paid = card("Paid shops", "Monthly recurring revenue");
    const uninstalls = card("Uninstalls this month", "Where installed shops sit today");

    // Installed shops grew 10 -> 12: an up badge in the header and an up icon after the footer headline.
    expect(installed).toContain("+20%");
    expect(installed).toMatch(/5 installed, 3 left in Feb\s*<svg[^>]*lucide-trending-up[^>]*size-4/);
    // Uninstalls rose 1 -> 3: a trend, so the icon follows the footer headline here too.
    expect(uninstalls).toMatch(/1 in Jan\s*<svg[^>]*lucide-trending-up[^>]*size-4/);
    // Paid shops has no month-over-month figure, so its footer carries no trend icon.
    expect(paid).not.toContain("lucide-trending");
  });
});
