import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, data, StaticRouterProvider, type RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "./layout";

/**
 * The /app layout's boundary, rendered the way the router renders it: a page's loader throws, the router hands the error to the
 * nearest boundary (this layout's), and the boundary decides what the merchant sees.
 */
async function render(thrown: () => never): Promise<string> {
  const routes: RouteObject[] = [{ id: "layout", path: "/app", ErrorBoundary, children: [{ id: "page", index: true, loader: thrown, Component: () => null }] }];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request("https://example.test/app"));
  if (context instanceof Response) throw new Error("the handler answered with a response, not a rendered context");
  return renderToString(<StaticRouterProvider router={createStaticRouter(handler.dataRoutes, context)} context={context} />);
}

describe("the /app layout's ErrorBoundary", () => {
  it("explains a blocked shop instead of showing a failure", async () => {
    const html = await render(() => {
      throw data({ reason: "blocked" }, { status: 403 });
    });
    expect(html).toContain("This account is unavailable");
    expect(html).toContain("Access to the app was turned off for this store.");
  });

  it("tells a member who may not open the page to ask for access", async () => {
    const html = await render(() => {
      throw data({ reason: "forbidden" }, { status: 403 });
    });
    expect(html).toContain("You cannot open this page");
    expect(html).toContain("Ask someone who manages the team to give you access.");
    expect(html).not.toContain("This account is unavailable");
  });

  it("renders the body of a thrown success response (App Bridge's session-token page), not a failure", async () => {
    const html = await render(() => {
      throw new Response('<script data-api-key="k" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>', { status: 200 });
    });
    expect(html).toContain("app-bridge.js");
    expect(html).not.toContain("You cannot open this page");
  });
});
