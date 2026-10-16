import type { ActionFunctionArgs } from "react-router";
import { verifyShopifyWebhook, webhookSecrets } from "~/adapters/shopify-webhook.server";
import { getEnv } from "~/request-context.server";
import { compliancePayloadSchema } from "~/schemas/compliance-webhook";
import { isComplianceTopic } from "~/services/compliance.server";
import { withWebhookFailureLog } from "~/services/webhook-logging";
import { shopLog } from "~/observability/shop-log";
import { enqueueVerifiedWebhook } from "./enqueue.server";

/**
 * The three MANDATORY compliance webhooks share this one endpoint, matching the
 * single `compliance_topics` subscription in shopify.app.toml.
 *
 * Requirements this satisfies
 * (https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance):
 *  • Handles POST with a JSON body.
 *  • An invalid Shopify HMAC header returns 401 Unauthorized —
 *    `verifyShopifyWebhook` throws exactly that Response, so it must NOT be
 *    caught and turned into a 200. Swallowing it would fail app review.
 *  • Returns a 2xx to confirm receipt.
 *
 * Shopify allows 5 s for the whole response and treats anything else as a failed delivery
 * (https://shopify.dev/docs/apps/build/webhooks/verify-deliveries), while the erasure is allowed 30 days. So this
 * route only VERIFIES and ENQUEUES: the 2xx means the delivery is durable on the queue (a failed send answers 5xx and
 * Shopify retries), and the queue consumer (`webhookConsumer()`, registry in `app/wiring/webhooks.server.ts`) writes
 * the inbox row and does the work, with retries.
 *
 * Once a shop has been redacted a minimal tombstone (hash + timestamp) remains, and the consumer's admission step
 * (`admitWebhook`) drops any later delivery for it (including a duplicate `shop/redact`) without storing a delivery
 * row; the route still answers 2xx. That tombstone is our own design: Shopify's docs say nothing about reinstalls.
 * See `.claude/rules/shopify-api-invariants.md`.
 */
export const action = ({ request }: ActionFunctionArgs) => withWebhookFailureLog(request, () => receive(request));

async function receive(request: Request): Promise<Response> {
  // Throws a 401 Response on a bad HMAC. Deliberately unguarded.
  const authenticated = await verifyShopifyWebhook(request, webhookSecrets(getEnv()));
  const { topic, shop } = authenticated;
  const parsed = compliancePayloadSchema.safeParse(authenticated.payload);
  if (!parsed.success) {
    // Non-2xx on purpose: Shopify retries for 4 hours, during which a too-strict schema can be fixed and redeployed.
    await shopLog("compliance.invalid_payload", shop, { topic });
    return new Response("Invalid compliance payload", { status: 400 });
  }

  if (!isComplianceTopic(topic)) {
    // Unknown topic: acknowledge so Shopify stops retrying, but log it as unhandled rather than reporting it done.
    await shopLog("compliance.unknown_topic", shop, { topic });
    return new Response(null, { status: 204 });
  }

  const startedAt = Date.now();
  await enqueueVerifiedWebhook(authenticated);

  // The duration to watch against Shopify's 5 s limit is now the enqueue, not the purge.
  await shopLog("compliance.enqueued", shop, { topic, durationMs: Date.now() - startedAt });
  return new Response(null, { status: 200 });
}

/**
 * Shopify only ever POSTs here. A GET is a misconfiguration (or a probe) — say
 * so with 405 instead of rendering an empty page that looks like success.
 */
export const loader = () => new Response("Method not allowed", { status: 405 });
