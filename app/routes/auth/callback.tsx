import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { isSafeHostParameter } from "@firesio/app";
import { firesio } from "~/firesio.server";

/**
 * The `/auth/*` splat, kept for the library's own bounce pages. It records NOTHING: this app authenticates by token exchange,
 * so there is no OAuth callback to complete. The install is written by the `afterAuth` hook (`@firesio/app`, `preset/shops/after-auth.ts`).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Shopify's host sanitiser throws on a malformed `host` parameter, which would surface as a 500: that is the caller's mistake.
  const host = new URL(request.url).searchParams.get("host");
  if (host !== null && !isSafeHostParameter(host)) throw new Response("Invalid host parameter", { status: 400 });
  await firesio.shopify.authenticate.admin(request);
  return null;
};

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
