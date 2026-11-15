import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { firesio } from "~/firesio.server";

/**
 * The `/auth/*` splat, kept for the library's own bounce pages. It records NOTHING: this app authenticates by token exchange,
 * so there is no OAuth callback to complete. The install is written by the `afterAuth` hook (`@firesio/app`, `preset/shops/after-auth.ts`).
 * `firesio.authenticate` answers 400 for a malformed `host` before Shopify's sanitiser can turn it into a 500, then is Shopify's own `authenticate.admin`.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => (await firesio.authenticate(request), null);

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
