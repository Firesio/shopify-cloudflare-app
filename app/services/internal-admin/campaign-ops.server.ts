import type { AudienceFilter, AudiencePreview } from "~/domain/campaign-audience";
import type { RecipientCounts } from "~/domain/campaign-delivery";
import type { Campaign, CampaignRecipient, CampaignSummary, RecipientStatus } from "~/ports/campaigns";
import type { CampaignDependencies } from "~/services/campaigns.server";
import { campaignDependencies } from "~/wiring.server";

/**
 * What the staff console reads about announcements, assembled from the campaign ports. The writes (draft, send, pause...)
 * are the use cases in `services/campaigns.server.ts`, called by the console's intent handlers with the signed-in actor.
 * Dependencies default to the real wiring; a test passes its own.
 */

/** The list shows the newest of these: a bound, so a long history never makes the page slow. */
export const CAMPAIGN_LIST_LIMIT = 100;
/** The recipient table shows at most this many rows of one status. */
export const RECIPIENT_LIMIT = 100;

export function listCampaigns(deps: CampaignDependencies = campaignDependencies()): Promise<readonly CampaignSummary[]> {
  return deps.store.list(CAMPAIGN_LIST_LIMIT);
}

/** Who an announcement with this audience would reach right now. */
export function previewAudienceOf(filter: AudienceFilter, deps: CampaignDependencies = campaignDependencies()): Promise<AudiencePreview> {
  return deps.audience.preview(filter);
}

/** What `/internal/campaigns/:id` shows: a draft is edited, anything else is a progress report. */
export type CampaignScreen =
  | { readonly kind: "draft"; readonly campaign: Campaign; readonly preview: AudiencePreview }
  | {
      readonly kind: "report";
      readonly campaign: Campaign;
      readonly counts: RecipientCounts;
      readonly recipients: readonly CampaignRecipient[];
      /** The status the recipient table is limited to, or null for everyone. */
      readonly recipientStatus: RecipientStatus | null;
      /** The most rows the table holds: when it is reached, there are more than are shown. */
      readonly recipientLimit: number;
    };

/** The screen for one campaign, or undefined when there is none. A draft's preview is of its SAVED audience: what a send would use. */
export async function loadCampaignScreen(
  id: string,
  recipientStatus: RecipientStatus | null,
  deps: CampaignDependencies = campaignDependencies(),
): Promise<CampaignScreen | undefined> {
  const campaign = await deps.store.find(id);
  if (campaign === undefined) return undefined;
  if (campaign.status === "draft") return { kind: "draft", campaign, preview: await deps.audience.preview(campaign.audience) };
  const [counts, recipients] = await Promise.all([
    deps.store.counts(id),
    deps.store.recipients(id, { ...(recipientStatus === null ? {} : { status: recipientStatus }), limit: RECIPIENT_LIMIT }),
  ]);
  return { kind: "report", campaign, counts, recipients, recipientStatus, recipientLimit: RECIPIENT_LIMIT };
}
