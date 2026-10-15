import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider, type RouteObject } from "react-router";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { i18nOptions } from "~/i18n/options";
import { runWithRequestContext } from "~/request-context.server";
import PublicLayout, { loader as layoutLoader } from "./_layout";
import Landing from "./landing";
import Pricing from "./pricing";

/**
 * The two install flows, rendered through the real layout loader so the handle
 * the deployment configures is what decides the page — not a prop the test
 * hands in.
 */
async function render(path: "/" | "/pricing", handle: string, locale: "en" | "es" = "en") {
  const instance = createInstance();
  await instance.use(initReactI18next).init({ ...i18nOptions, lng: locale });

  const routes: RouteObject[] = [
    {
      id: "routes/public/_layout",
      path: "/",
      Component: PublicLayout,
      loader: layoutLoader,
      children: [
        { index: true, Component: Landing },
        { path: "pricing", Component: Pricing },
      ],
    },
  ];
  const context = await runWithRequestContext(Object.assign({}, env, { SHOPIFY_APP_HANDLE: handle }), () =>
    createStaticHandler(routes).query(new Request(`https://example.test${path}`)),
  );
  if (context instanceof Response) throw new Error(`Expected a render context, got ${context.status}`);

  const html = renderToString(
    <I18nextProvider i18n={instance}>
      <StaticRouterProvider router={createStaticRouter(routes, context)} context={context} />
    </I18nextProvider>,
  );
  expect(html.length, "rendered nothing — assertions would be vacuous").toBeGreaterThan(500);
  return html;
}

const LISTING = "https://apps.shopify.com/my-app";
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((match) => match[1]);
const hasShopField = (html: string) => /<input[^>]*name="shop"/.test(html);

describe("when the app has an App Store listing", () => {
  it("shows one link to the listing on the landing page, and no field for a shop domain", async () => {
    const html = await render("/", "my-app");

    expect(html).toContain("Install from the Shopify App Store");
    expect(hrefs(html)).toContain(LISTING);
    expect(hasShopField(html)).toBe(false);
    expect(html).not.toContain("myshopify.com");
  });

  it("points the header Install button and every pricing plan at the listing, not at /auth/login", async () => {
    const landing = await render("/", "my-app");
    const pricing = await render("/pricing", "my-app");

    expect(hrefs(landing)).not.toContain("/auth/login");
    expect(hrefs(pricing)).not.toContain("/auth/login");
    // The header button plus one "get started" per plan.
    expect(hrefs(pricing).filter((href) => href === LISTING).length).toBeGreaterThanOrEqual(2);
  });

  it("opens the listing with a noopener link", async () => {
    const html = await render("/", "my-app");
    expect(html).toMatch(new RegExp(`<a [^>]*href="${LISTING}"[^>]*rel="noopener"|<a [^>]*rel="noopener"[^>]*href="${LISTING}"`));
  });

  it("translates the call to action", async () => {
    const html = await render("/", "my-app", "es");
    expect(html).toContain("Instalar desde la Shopify App Store");
  });
});

describe("when the app has no listing yet", () => {
  it("keeps the shop-domain form on the landing page, posting to /auth/login", async () => {
    const html = await render("/", "");

    expect(hasShopField(html)).toBe(true);
    expect(html).toMatch(/<form[^>]*action="\/auth\/login"/);
    expect(html).not.toContain("apps.shopify.com");
    expect(html).not.toContain("Install from the Shopify App Store");
  });

  it("keeps the header Install button and the pricing plans pointing at /auth/login", async () => {
    const pricing = await render("/pricing", "");

    expect(hrefs(pricing).filter((href) => href === "/auth/login").length).toBeGreaterThanOrEqual(2);
    expect(hrefs(pricing).some((href) => href?.includes("apps.shopify.com"))).toBe(false);
  });

  it("falls back to the form, never a broken link, when the configured handle is malformed", async () => {
    const html = await render("/", "https://evil.example/phish");

    expect(hasShopField(html)).toBe(true);
    expect(html).not.toContain("evil.example");
  });
});
