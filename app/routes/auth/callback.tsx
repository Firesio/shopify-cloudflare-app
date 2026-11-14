import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticateAdmin } from "~/wiring/guard";

/**
 * The `/auth/*` splat, kept for the library's own bounce pages. It records NOTHING: this app authenticates by token exchange,
 * so there is no OAuth callback to complete. The install is written by the `afterAuth` hook (`core/shops/after-auth.ts`).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateAdmin(request);
  return null;
};

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
