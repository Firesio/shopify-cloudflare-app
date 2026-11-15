import type { ActionFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

/**
 * The receiver for every Shopify webhook (`/webhooks/app/uninstalled`, `/webhooks/compliance`; the URIs in both shopify.app*.toml
 * files): ONE line, for every delivery and every topic, with the RAW `Request`. Never `firesio.shopify.authenticate.webhook`
 * here, and no branch on the topic. Why, what the preset does with it and how to add a topic: `docs/webhooks.md`.
 */
export const action = ({ request }: ActionFunctionArgs) => firesio.webhook(request);

/** Shopify only ever POSTs here: a GET is a misconfiguration or a probe, and says so. */
export const loader = () => new Response("Method not allowed", { status: 405 });
