import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, data, StaticRouterProvider, type RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "./root";

/**
 * The root's boundary, rendered the way the router renders it. An error thrown by the /app MIDDLEWARE (a blocked shop, App Bridge's
 * session-token page) is handed to the boundary of the shallowest route with a loader, which is this root: so it is the one that
 * must word the refusal and render the bounce page (`app/routes/app/layout.test.tsx` covers what a page's loader throws).
 */
async function render(thrown: () => never, path = "/"): Promise<string> {
  const routes: RouteObject[] = [{ id: "root", path: "/*", ErrorBoundary, loader: thrown, Component: () => null }];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`https://example.test${path}`));
  if (context instanceof Response) throw new Error("the handler answered with a response, not a rendered context");
  return renderToString(<StaticRouterProvider router={createStaticRouter(handler.dataRoutes, context)} context={context} />);
}

describe("the root ErrorBoundary", () => {
  it("explains a blocked shop, thrown by the guard, instead of showing a failure", async () => {
    const html = await render(() => {
      throw data({ reason: "blocked" }, { status: 403 });
    });
    expect(html).toContain("This account is unavailable");
    expect(html).toContain("Access to the app was turned off for this store.");
    expect(html).toContain("<html");
  });

  it("renders the body of a thrown success response (App Bridge's session-token page), not a failure", async () => {
    const html = await render(() => {
      throw new Response('<script data-api-key="k" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>', { status: 200 });
    });
    expect(html).toContain("app-bridge.js");
    expect(html).not.toContain("Something went wrong");
    expect(html).not.toContain("This account is unavailable");
  });

  it("says a page does not exist for a 404, and that something went wrong for any other failure", async () => {
    expect(await render(() => {
      throw data("no such shop", { status: 404 });
    })).toContain("Page not found");
    expect(await render(() => {
      throw new Error("a crash");
    })).toContain("Something went wrong");
  });

  it("links back to the start on the public side, but not inside the admin, where a plain link would lose the session", async () => {
    const notFound = () => {
      throw data(null, { status: 404 });
    };
    expect(await render(notFound, "/nope")).toContain("Back to the start");
    expect(await render(notFound, "/app/nope")).not.toContain("Back to the start");
  });
});
