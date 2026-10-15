import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  type RouteObject,
} from "react-router";
import Shops from "./index";

type ShopRow = {
  shop: string;
  installedAt: number;
  active: boolean;
  planName: string;
};

async function render(shops: ShopRow[]) {
  const routes: RouteObject[] = [
    { path: "/internal/shops", Component: Shops, loader: () => ({ shops }) },
  ];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request("https://example.test/internal/shops"));
  if (context instanceof Response) {
    throw new Error(`Expected a render context, got ${context.status}`);
  }
  const html = renderToString(
    <StaticRouterProvider router={createStaticRouter(routes, context)} context={context} />,
  );
  expect(html.length, "rendered nothing").toBeGreaterThan(200);
  return html;
}

/** The markup of the body row that mentions `text`, so a value is tied to ITS row. */
function rowContaining(html: string, text: string): string {
  const row = html.split("<tr").find((part) => part.includes(text));
  expect(row, `no table row mentions ${text}`).toBeDefined();
  return row ?? "";
}

describe("the internal shops list", () => {
  it("shows each shop with a link to its detail page, in its own row", async () => {
    const html = await render([
      { shop: "cool-shop.myshopify.com", installedAt: 1_700_000_000_000, active: true, planName: "Free" },
    ]);
    const row = rowContaining(html, "cool-shop.myshopify.com");
    expect(row).toContain('href="/internal/shops/cool-shop.myshopify.com"');
    expect(row).toContain("Free");
    expect(row).toContain("Active");
    expect(row).toContain("Nov 14, 2023");
  });

  it("shows an uninstalled shop as such, in its own row", async () => {
    const html = await render([
      { shop: "gone.myshopify.com", installedAt: 1, active: false, planName: "Free" },
      { shop: "here.myshopify.com", installedAt: 2, active: true, planName: "Free" },
    ]);
    expect(rowContaining(html, "gone.myshopify.com")).toContain("Uninstalled");
    expect(rowContaining(html, "here.myshopify.com")).not.toContain("Uninstalled");
  });

  it("leaves the title to the shell header and keeps the description in the table toolbar", async () => {
    const html = await render([
      { shop: "cool-shop.myshopify.com", installedAt: 1, active: true, planName: "Free" },
    ]);
    expect(html).not.toContain("<h1");
    expect(html).toContain("Every shop that has ever installed this app.");
  });

  it("offers sorting on the name, plan and installed columns, and paging", async () => {
    const html = await render([
      { shop: "cool-shop.myshopify.com", installedAt: 1, active: true, planName: "Free" },
    ]);
    for (const title of ["Shop", "Plan", "Installed"]) {
      expect(html, title).toMatch(new RegExp(`<button[^>]*>${title}<svg`));
    }
    expect(html).toContain("Page 1 of 1");
    expect(html).toContain("1 row");
  });

  it("shows an empty state with no shops yet", async () => {
    const html = await render([]);
    expect(html).toContain("No shops yet");
    expect(html).toContain("The first install writes a row here.");
  });
});
