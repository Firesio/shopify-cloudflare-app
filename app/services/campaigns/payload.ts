import type { CampaignContent } from "~/domain/campaign";
import type { CampaignMessagePayload } from "~/notifications/payloads";

/** One announcement as one merchant reads it. The same function builds the real mail and the proof, so they cannot differ. */
export function messagePayload(content: CampaignContent, shopName: string, unsubscribeUrl: string): CampaignMessagePayload {
  return {
    recipientName: shopName,
    shopName,
    subject: content.subject,
    body: content.body,
    ...(content.ctaLabel !== null && content.ctaUrl !== null ? { ctaLabel: content.ctaLabel, ctaUrl: content.ctaUrl } : {}),
    unsubscribeUrl,
  };
}
