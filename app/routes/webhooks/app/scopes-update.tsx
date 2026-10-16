import type { ActionFunctionArgs } from "react-router";
import { verifyShopifyWebhook, webhookSecrets } from "~/adapters/shopify-webhook.server";
import { getEnv } from "~/request-context.server";
import { scopesUpdatePayloadSchema } from "~/schemas/webhooks";
import { withWebhookFailureLog } from "~/services/webhook-logging";
import { enqueueVerifiedWebhook } from "../enqueue.server";

export const action = ({ request }: ActionFunctionArgs) => withWebhookFailureLog(request, () => receive(request));

async function receive(request: Request): Promise<Response> {
  const authenticated = await verifyShopifyWebhook(request, webhookSecrets(getEnv()));
  const parsed = scopesUpdatePayloadSchema.safeParse(authenticated.payload);
  if (!parsed.success) throw new Response("Invalid app/scopes_update payload", { status: 400 });

  // The scope set is the one typed value the handler needs, so it rides on the message (the payload does not).
  await enqueueVerifiedWebhook(authenticated, parsed.data.current);
  return new Response(null, { status: 200 });
}
