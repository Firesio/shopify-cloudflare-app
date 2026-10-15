import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createStaticHandler, type RouteObject } from "react-router";
import { runWithRequestContext } from "~/request-context.server";
import { action, loader } from "./login";

/**
 * /auth/login in the two install flows. Once the app is listed, the page never
 * asks for a shop domain (App Store requirement 2.3.1): it sends visitors to the
 * listing. Before that, it is the form it always was.
 */
const LISTING = "https://apps.shopify.com/my-app";
const routes: RouteObject[] = [{ path: "/auth/login", loader, action, Component: () => null }];

function query(request: Request, handle: string) {
  return runWithRequestContext(Object.assign({}, env, { SHOPIFY_APP_HANDLE: handle }), () =>
    createStaticHandler(routes).query(request),
  );
}

describe("/auth/login with an App Store listing", () => {
  it("redirects a visit with no shop to the listing instead of showing a form", async () => {
    const result = await query(new Request("https://example.test/auth/login"), "my-app");

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("expected a redirect");
    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe(LISTING);
  });

  it("redirects a visit with an invalid shop to the listing rather than reporting a shop-domain error", async () => {
    const result = await query(new Request("https://example.test/auth/login?shop=not%20a%20valid%20shop"), "my-app");

    if (!(result instanceof Response)) throw new Error("expected a redirect");
    expect(result.headers.get("Location")).toBe(LISTING);
  });

  it("refuses a typed-in shop domain: a POST goes to the listing and never reaches OAuth", async () => {
    const result = await query(
      new Request("https://example.test/auth/login", {
        method: "POST",
        body: new URLSearchParams({ shop: "someone.myshopify.com" }),
      }),
      "my-app",
    );

    if (!(result instanceof Response)) throw new Error("expected a redirect");
    expect(result.headers.get("Location")).toBe(LISTING);
  });

  it("still lets a request that carries a valid shop through to Shopify's install page", async () => {
    // The library sends an expired session back through login with its shop; that is not manual entry.
    const result = await query(new Request("https://example.test/auth/login?shop=some-shop.myshopify.com"), "my-app");

    if (!(result instanceof Response)) throw new Error("expected a redirect");
    expect(result.headers.get("Location")).toContain("https://admin.shopify.com/store/some-shop/oauth/install");
  });
});

describe("/auth/login with no listing yet", () => {
  it("still handles a visit with no shop itself, asking for the domain", async () => {
    const result = await query(new Request("https://example.test/auth/login"), "");

    // A render context, not a redirect: the form page is what answers.
    expect(result).not.toBeInstanceOf(Response);
  });

  it("does not redirect a malformed handle anywhere", async () => {
    const result = await query(new Request("https://example.test/auth/login"), "https://evil.example");

    expect(result).not.toBeInstanceOf(Response);
  });
});
