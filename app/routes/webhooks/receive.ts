import { firesio } from "~/firesio.server";

/**
 * The receiver for every Shopify webhook (`/webhooks/app/uninstalled`, `/webhooks/compliance`; the URIs in both shopify.app*.toml
 * files): ONE line, for every delivery and every topic, with the RAW `Request`. Never `firesio.shopify.authenticate.webhook`
 * here, and no branch on the topic. `loader` answers a GET (Shopify only ever POSTs here) with 405. Why, what the preset does
 * with it and how to add a topic: `docs/webhooks.md`. Two exports, not `export const { action, loader } = ...`: React Router's build
 * cannot strip a destructured export from the client bundle ("Cannot remove destructured export").
 */
export const action = firesio.webhookRoute.action;
export const loader = firesio.webhookRoute.loader;
