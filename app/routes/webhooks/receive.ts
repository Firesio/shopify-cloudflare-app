import type { ActionFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

/**
 * The receiver for every Shopify webhook (`/webhooks/app/uninstalled`, `/webhooks/compliance`; the URIs in both
 * shopify.app*.toml files): ONE line, for every delivery, with the RAW `Request`. The preset VERIFIES the HMAC itself first, for any
 * topic (an invalid one is a 401, also for a topic nobody handles: it is an app-review check; `SHOPIFY_API_SECRET_PREVIOUS` is
 * accepted for the hour a rotation takes). A topic it runs (the uninstall, the three GDPR ones and the `webhooks` of
 * `firesio.server.ts`) goes onto the queue as ONE durable message and answers 2xx; a verified topic it does not run (a subscription
 * nothing here handles) answers 200 and queues nothing, so Shopify does not retry it for days. Nothing is written to D1 in the
 * request. `workers/app.ts` consumes the queue.
 *
 * Invariant: NOT `firesio.shopify.authenticate.webhook` here. That call loads the offline session and refreshes it when it is near
 * expiry, and a refresh that fails (the token of an uninstalled app) becomes a 500 for `app/uninstalled` itself
 * (`docs/shopify-api-invariants.md`); it also loses `SHOPIFY_API_SECRET_PREVIOUS`. A topic of the app's own is a `webhooks` handler
 * in `app/firesio.server.ts` (run by the preset's queue consumer through the same inbox); one that needs an Admin API session calls
 * `authenticate.webhook` for that topic only, in its own branch above this line.
 */
export const action = ({ request }: ActionFunctionArgs) => firesio.webhook(request);

/** Shopify only ever POSTs here: a GET is a misconfiguration or a probe, and says so. */
export const loader = () => new Response("Method not allowed", { status: 405 });
