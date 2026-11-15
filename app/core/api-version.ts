import { ApiVersion } from "@shopify/shopify-app-react-router/server";

/**
 * The Admin API / webhook version, in ONE place. It is a single decision with `api_version` in `shopify.app.toml` and
 * `shopify.app.dev.toml`, and it reaches Shopify through `createFiresio({ shopify: { apiVersion } })` in
 * `app/firesio.server.ts`: change the three together (`npm run check:placeholders` reads this file and refuses a toml that
 * disagrees). The Partner API is versioned separately, inside `@firesio/app` (the plans library's default).
 *
 * Kept in its own module so Node scripts and config files (`scripts/check-placeholders.mjs`, a `.graphqlrc.ts` once the app adds GraphQL
 * codegen: see the README) can read it without importing `firesio.server.ts` and its whole runtime graph.
 */
export const apiVersion = ApiVersion.October26;
