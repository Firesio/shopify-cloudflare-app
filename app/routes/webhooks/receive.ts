import type { ActionFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

/**
 * The receiver for every Shopify webhook (`/webhooks/app/uninstalled`, `/webhooks/compliance`; the URIs in both
 * shopify.app*.toml files). For a topic the preset owns (the uninstall, the three GDPR ones and the `webhooks` of `firesio.server.ts`: `firesio.handles`) the preset
 * VERIFIES the HMAC itself from the raw request (an invalid one stays a 401: it is an app-review check; `SHOPIFY_API_SECRET_PREVIOUS`
 * is accepted for the hour a rotation takes), puts ONE durable message on the queue and answers 2xx. Nothing is written to D1 in
 * the request. `workers/app.ts` consumes the queue.
 *
 * NOT `firesio.shopify.authenticate.webhook` here: that call loads the offline session and refreshes it when it is near expiry,
 * and a refresh that fails (the token of an uninstalled app) becomes a 500 for `app/uninstalled` itself
 * (`docs/shopify-api-invariants.md`). A topic of the app's own is a `webhooks` handler in `app/firesio.server.ts` (run by the preset's queue consumer through the same
 * inbox); one that needs an Admin API session calls `authenticate.webhook` for that topic only, in its own branch below.
 */
export async function action({ request }: Pick<ActionFunctionArgs, "request">): Promise<Response> {
  const topic = request.headers.get("x-shopify-topic");
  if (firesio.handles(topic)) return firesio.webhook(request);
  // A subscription in a shopify.app*.toml that nothing here handles: answer 2xx so Shopify does not retry it for days, and say so.
  console.log(JSON.stringify({ event: "webhook.unhandled", topic: (topic ?? "").slice(0, 64) }));
  return new Response(null, { status: 200 });
}

/** Shopify only ever POSTs here: a GET is a misconfiguration or a probe, and says so. */
export const loader = () => new Response("Method not allowed", { status: 405 });
