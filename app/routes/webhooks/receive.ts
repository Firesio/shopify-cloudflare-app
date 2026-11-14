import { env } from "cloudflare:workers";
import { toQueuedWebhook, verifyWebhook, webhookRejectionResponse, webhookSecrets } from "@firesio/shopify";
import type { ActionFunctionArgs } from "react-router";
import { services } from "~/wiring/services";

/**
 * The receiver for every Shopify webhook (`/webhooks/app/uninstalled`, `/webhooks/compliance`; the URIs in both
 * shopify.app*.toml files): VERIFY the HMAC, put ONE durable message on the queue, answer 2xx within Shopify's 5 seconds, and
 * write nothing to D1. The 2xx means "this delivery will not be lost" (a failed send answers 5xx and Shopify retries). The
 * queue consumer (`workers/app.ts`) admits, claims, runs and settles it. An invalid HMAC must stay a 401: it is an app-review check.
 *
 * Secrets: the current one, and `SHOPIFY_API_SECRET_PREVIOUS` for the hour a rotation takes (set it by `wrangler secret put`
 * for that window only and remove it after: it is deliberately not declared in `wrangler.jsonc`).
 */
export async function action({ request }: Pick<ActionFunctionArgs, "request">): Promise<Response> {
  const previous = "SHOPIFY_API_SECRET_PREVIOUS" in env ? env.SHOPIFY_API_SECRET_PREVIOUS : undefined;
  const verified = await verifyWebhook(request, webhookSecrets(env.SHOPIFY_API_SECRET, previous));
  if (!verified.ok) return webhookRejectionResponse(verified.error);
  const s = services();
  await env.WEBHOOK_QUEUE.send(await toQueuedWebhook(verified.value, { now: s.runtime.now() }));
  return new Response(null, { status: 200 });
}

/** Shopify only ever POSTs here: a GET is a misconfiguration or a probe, and says so. */
export const loader = () => new Response("Method not allowed", { status: 405 });
