import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { createStaticHandler, createStaticRouter, data, StaticRouterProvider, type RouteObject } from "react-router";
import { MEMBER_PERMISSIONS, permissionsOf } from "~/domain/member-access";
import { i18nOptions } from "~/i18n/options";
import App, { ErrorBoundary } from "./_layout";

async function html(routes: RouteObject[], path = "/app"): Promise<string> {
  const instance = createInstance();
  await instance.use(initReactI18next).init({ ...i18nOptions, lng: "en" });
  const context = await createStaticHandler(routes).query(new Request(`https://example.test${path}`));
  if (context instanceof Response) throw new Error("Expected render context");
  return renderToString(
    <I18nextProvider i18n={instance}>
      <StaticRouterProvider router={createStaticRouter(routes, context)} context={context} hydrate={false} />
    </I18nextProvider>,
  );
}

const granted = (role: "owner" | "admin" | "member" | "viewer") => ({
  apiKey: "test",
  timeZone: "UTC",
  access: { granted: true as const, permissions: permissionsOf(role) },
});

describe("Shopify admin navigation", () => {
  it("uses the current Polaris app-nav web component", async () => {
    const out = await html([{ path: "/app", Component: App, loader: () => granted("owner") }]);
    expect(out).toContain("s-app-nav");
    expect(out).toContain('rel="home"');
    expect(out).toContain("s-link");
    expect(out).not.toContain("NavMenu");
  });

  it("offers the billing link to a role that can manage the plan, and to no other", async () => {
    for (const role of ["owner", "admin", "member", "viewer"] as const) {
      const out = await html([{ path: "/app", Component: App, loader: () => granted(role) }]);
      expect(out.includes('href="/app/billing"')).toBe(permissionsOf(role).includes("billing:manage"));
      expect(out).toContain('href="/app/support"');
    }
    expect(MEMBER_PERMISSIONS).toContain("billing:manage");
  });
});

describe("a person the app will not let in", () => {
  const refused = (reason: "pending" | "removed" | "not_invited" | "forbidden") => [
    { path: "/app", Component: App, loader: () => ({ apiKey: "test", timeZone: "UTC", access: { granted: false as const, reason } }), children: [{ index: true, Component: () => <p>PAGE CONTENT</p> }] },
  ];

  it.each([
    ["pending", "Waiting for approval"],
    ["removed", "You no longer have access"],
    ["not_invited", "You need an invitation"],
    ["forbidden", "You do not have permission for this"],
  ] as const)("is told why (%s), and is shown none of the app", async (reason, heading) => {
    const out = await html(refused(reason));
    expect(out).toContain(heading);
    expect(out).not.toContain("PAGE CONTENT");
    expect(out).not.toContain("s-app-nav");
  });

  it("is told who can change it", async () => {
    expect(await html(refused("not_invited"))).toContain("Ask an owner");
  });

  it("is given someone to ask, by name and address, when the shop has an owner or admin", async () => {
    const routes: RouteObject[] = [
      {
        path: "/app",
        Component: App,
        loader: () => ({
          apiKey: "test",
          timeZone: "UTC",
          access: { granted: false as const, reason: "pending" as const, contacts: [{ name: "Ada", email: "ada@firesio.app" }, { name: null, email: "bo@firesio.app" }] },
        }),
      },
    ];
    expect(await html(routes)).toContain("Ask Ada (ada@firesio.app) and bo@firesio.app.");
  });

  it("says nothing about who to ask when nobody can be named", async () => {
    expect(await html(refused("pending"))).not.toContain("Ask Ada");
  });
});

describe("a page the person may not open", () => {
  // The boundary reads the layout's own loader data by the id the router gives that route.
  const routes: RouteObject[] = [
    {
      id: "root",
      path: "/",
      ErrorBoundary: () => <p>ROOT BOUNDARY</p>,
      children: [
        {
          id: "routes/app/_layout",
          path: "app",
          Component: App,
          ErrorBoundary,
          loader: () => granted("viewer"),
          children: [
            {
              path: "billing",
              loader: () => {
                throw data({ reason: "forbidden" }, { status: 403 });
              },
              Component: () => <p>PAGE CONTENT</p>,
            },
          ],
        },
      ],
    },
  ];

  it("is explained in the app's own frame instead of as a failure", async () => {
    const out = await html(routes, "/app/billing");
    expect(out).toContain("You do not have permission for this");
    expect(out).not.toContain("PAGE CONTENT");
    expect(out).not.toContain("ROOT BOUNDARY");
  });
});

describe("thrown responses", () => {
  const BOUNCE = '<script data-api-key="key" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>';

  async function renderThrown(response: Response): Promise<string> {
    const routes: RouteObject[] = [{
      path: "/",
      ErrorBoundary: () => <p>ROOT BOUNDARY</p>,
      children: [{ path: "app", id: "routes/app/_layout", Component: App, ErrorBoundary, loader: () => { throw response; } }],
    }];
    return html(routes);
  }

  it("renders the App Bridge bounce page the library throws, so the merchant gets a session token instead of an error", async () => {
    const out = await renderThrown(new Response(BOUNCE, { status: 200 }));
    expect(out).toContain("https://cdn.shopify.com/shopifycloud/app-bridge.js");
    expect(out).not.toContain("ROOT BOUNDARY");
  });

  it("rethrows a real failure, so React Router renders its root boundary instead of raw text", async () => {
    await expect(renderThrown(new Response("Condition not found", { status: 404 }))).rejects.toMatchObject({ status: 404 });
  });

  it("rethrows a 403 that is not one of the app's refusals", async () => {
    await expect(renderThrown(new Response("nope", { status: 403 }))).rejects.toMatchObject({ status: 403 });
  });
});
