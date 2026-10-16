import type { WebhookDeadLetterPayload } from "~/notifications/payloads";
import { Cta, EmailLayout, Muted, P } from "../layout";
import { renderEmail, type RenderedEmail } from "../render";

/**
 * Staff-facing: a Shopify webhook ran out of retries. STAFF-FACING, so deliberately English — see @rules/i18n.md.
 *
 * The topic goes in the subject because this lands in a shared inbox where the subject is the only triage signal,
 * and the delivery id is in the body because it is how the delivery is found in the failures API. No payload and no
 * failure text: ids and names only.
 */
export function webhookDeadLetterEmail(p: WebhookDeadLetterPayload): Promise<RenderedEmail> {
  return renderEmail(
    `Webhook failed: ${p.topic}`,
    <EmailLayout preview={`${p.topic} for ${p.shop} will not be retried`} heading={`Webhook failed: ${p.topic}`} logoUrl={p.logoUrl} locale={p.locale}>
      <P>
        The {p.topic} webhook for {p.shopName} ({p.shop}) ran out of retries on {p.occurredAt}, so the work it carried did not happen.
        Delivery id: {p.deliveryId}.
      </P>
      <Cta href={p.adminUrl}>Open the shop</Cta>
      <Muted>
        You are getting this because webhook failure notifications are on for your account. Change that under
        Notifications in the internal console.
      </Muted>
    </EmailLayout>,
  );
}
