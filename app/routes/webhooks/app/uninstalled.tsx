import type { ActionFunctionArgs } from "react-router";
import { verifyShopifyWebhook, webhookSecrets } from "~/adapters/shopify-webhook.server";
import { getEnv } from "~/request-context.server";
import { withWebhookFailureLog } from "~/services/webhook-logging";
import { enqueueVerifiedWebhook } from "../enqueue.server";

export const action = ({ request }: ActionFunctionArgs) => withWebhookFailureLog(request, () => receive(request));

async function receive(request: Request): Promise<Response> {
  await enqueueVerifiedWebhook(await verifyShopifyWebhook(request, webhookSecrets(getEnv())));
  return new Response(null, { status: 200 });
}
