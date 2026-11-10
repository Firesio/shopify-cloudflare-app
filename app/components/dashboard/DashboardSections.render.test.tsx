import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { renderRoute } from "~/test/render-route";
import { ChannelsSection, PerformanceSection, type DashboardChannel, type DashboardPerformance } from "./DashboardSections";
import { MetricCard } from "./MetricCard";

const render = (element: ReactElement, locale: "en" | "es" = "en") =>
  renderRoute({ path: "/x", Component: () => element, loaderData: {}, locale, stage: "pending" });
const count = (html: string, tag: string) => (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;

const PERFORMANCE: DashboardPerformance = {
  sales: { value: 123_456, change: 0.125 },
  orders: { value: 328, change: -0.032 },
  conversion: { value: 0.042, change: 0 },
  currency: "USD",
};
const CHANNELS: readonly DashboardChannel[] = [
  { key: "a", label: "Online store", sales: 1000, orders: 3 },
  { key: "b", label: "Shop app", sales: 2000, orders: 4 },
  { key: "c", label: "Social", sales: 3000, orders: 5 },
];

describe("PerformanceSection", () => {
  it("shows the real heading, labels and links while loading, with skeletons in place of the numbers", async () => {
    const html = await render(<PerformanceSection performance="loading" />);
    expect(html).toContain("Sales performance · Last 30 days");
    for (const label of ["Net sales", "Orders", "Conversion rate"]) expect(html).toContain(`<s-heading>${label}</s-heading>`);
    expect(html).toContain('href="/admin/orders"');
    expect(html).toContain('data-skeleton=""');
    expect(html).toContain("Loading sales performance");
    expect(html).not.toContain("<s-spinner");
  });

  it("has the same footprint loading and loaded: the same cards, dividers, grid and section", async () => {
    const loading = await render(<PerformanceSection performance="loading" />);
    const loaded = await render(<PerformanceSection performance={PERFORMANCE} />);
    for (const tag of ["s-section", "s-grid", "s-clickable", "s-divider", "s-heading"]) {
      expect(count(loading, tag), tag).toBe(count(loaded, tag));
    }
    expect(count(loaded, "s-clickable")).toBe(3);
    expect(loaded).not.toContain("data-skeleton");
  });

  it("formats the numbers and the change for the reader's language", async () => {
    const en = await render(<PerformanceSection performance={PERFORMANCE} />, "en");
    expect(en).toContain("$1,234.56");
    expect(en).toContain("+12.5%");
    const es = await render(<PerformanceSection performance={PERFORMANCE} />, "es");
    expect(es).toContain("+12,5");
    expect(es).toContain("Últimos 30 días");
  });

  it("gives each metric the badge of its own direction", async () => {
    const html = await render(<PerformanceSection performance={PERFORMANCE} />);
    expect(html).toContain('<s-badge tone="success" icon="arrow-up">+12.5%</s-badge>');
    expect(html).toContain('tone="critical" icon="arrow-down"');
    expect(html).toContain('tone="neutral" icon="minus"');
  });
});

describe("MetricCard", () => {
  it("tells a rise, a fall and no change apart, and never calls zero good", async () => {
    const card = (trend: "up" | "down" | "flat") => render(<MetricCard label="Orders" href="/admin/orders" reading={{ value: "5", change: "x", trend }} />);
    expect(await card("up")).toContain('tone="success" icon="arrow-up"');
    expect(await card("down")).toContain('tone="critical" icon="arrow-down"');
    const flat = await card("flat");
    expect(flat).toContain('tone="neutral" icon="minus"');
    expect(flat).not.toContain("success");
  });
});

describe("ChannelsSection", () => {
  it("shows the real header and as many skeleton rows as expected while loading", async () => {
    const html = await render(<ChannelsSection channels="loading" currency="USD" expectedRows={3} />);
    expect(html).toContain('heading="Sales by channel"');
    expect(count(html, "s-table-header")).toBe(3);
    expect(count(html, "s-table-row")).toBe(3);
    expect(count(html, "s-table-cell")).toBe(9);
    expect(html).toContain("Loading sales by channel");
  });

  it("has the same columns and row count loaded as loading, when the row count was guessed right", async () => {
    const loading = await render(<ChannelsSection channels="loading" currency="USD" expectedRows={CHANNELS.length} />);
    const loaded = await render(<ChannelsSection channels={CHANNELS} currency="USD" />);
    for (const tag of ["s-section", "s-table", "s-table-header", "s-table-row", "s-table-cell"]) {
      expect(count(loading, tag), tag).toBe(count(loaded, tag));
    }
    expect(loaded).toContain("$30.00");
    expect(loaded).not.toContain("data-skeleton");
  });

  it("names the section and shows an empty state, not an empty table, when there are no channels", async () => {
    const html = await render(<ChannelsSection channels={[]} currency="USD" />);
    expect(html).toContain('heading="Sales by channel"');
    expect(html).toContain('<s-empty-state heading="No sales channels yet"');
    expect(html).not.toContain("<s-table");
  });
});
