import { describeAudience, type AudienceFilter, type AudiencePreview } from "~/domain/campaign-audience";
import type { CampaignStatus } from "~/domain/campaign";
import { percentDone, type RecipientCounts } from "~/domain/campaign-delivery";
import type { Campaign, CampaignRecipient, CampaignSummary, RecipientStatus } from "~/ports/campaigns";
import type { CampaignActor } from "~/services/campaigns.server";
import { adminUsers, campaignDependencies } from "~/wiring.server";

/** The most a status filter looks through: the list is newest first, so this is the recent history, not all of it. */
const LIST_WINDOW = 200;
/** The most recipients one reply ever carries. */
export const RECIPIENT_SAMPLE_MAX = 50;
/** Per status when no status is asked for, so five statuses never exceed `RECIPIENT_SAMPLE_MAX`. */
const SAMPLE_PER_STATUS = 10;
const RECIPIENT_STATUSES: readonly RecipientStatus[] = ["pending", "sent", "failed", "refused", "skipped"];

export interface CampaignDetail {
  readonly campaign: Campaign;
  readonly audienceSentences: readonly string[];
  readonly counts: RecipientCounts;
  readonly percentDone: number;
  readonly recipients: readonly CampaignRecipient[];
}

/** Newest first. A status filter is applied over the most recent `LIST_WINDOW` campaigns, then cut to `limit`. */
export async function listCampaignSummaries(input: { status?: CampaignStatus; limit: number }): Promise<readonly CampaignSummary[]> {
  const { store } = campaignDependencies();
  if (input.status === undefined) return store.list(input.limit);
  const recent = await store.list(LIST_WINDOW);
  return recent.filter((campaign) => campaign.status === input.status).slice(0, input.limit);
}

/** The campaign alone, for a tool that edits it; undefined when there is no such campaign. */
export function findCampaign(id: string): Promise<Campaign | undefined> {
  return campaignDependencies().store.find(id);
}

/** One campaign with its delivery counts and a bounded sample of recipients; undefined when there is no such campaign. */
export async function getCampaignDetail(input: { id: string; recipientStatus?: RecipientStatus; recipientLimit: number }): Promise<CampaignDetail | undefined> {
  const { store } = campaignDependencies();
  const campaign = await store.find(input.id);
  if (campaign === undefined) return undefined;
  const statuses = input.recipientStatus === undefined ? RECIPIENT_STATUSES : [input.recipientStatus];
  const perStatus = Math.min(input.recipientLimit, input.recipientStatus === undefined ? SAMPLE_PER_STATUS : RECIPIENT_SAMPLE_MAX);
  const [counts, ...samples] = await Promise.all([
    store.counts(campaign.id),
    ...statuses.map((status) => store.recipients(campaign.id, { status, limit: perStatus })),
  ]);
  return {
    campaign,
    audienceSentences: describeAudience(campaign.audience),
    counts,
    percentDone: percentDone(counts),
    recipients: samples.flat().slice(0, RECIPIENT_SAMPLE_MAX),
  };
}

/** Who an audience would reach, by the same query a real send uses. */
export function previewAudienceFor(filter: AudienceFilter): Promise<AudiencePreview> {
  return campaignDependencies().audience.preview(filter);
}

/**
 * Who an MCP call acts as. An agent has no console session, so the announcement records the address of the staff
 * account its token was issued to; `fallbackLabel` (the token's label, which is not an address) is only a record when
 * that account cannot be found. `address` is what a proof may be mailed to: null unless it really is the owner's.
 */
export async function resolveCampaignActor(input: { adminUserId: string | null | undefined; fallbackLabel: string }): Promise<{ actor: CampaignActor; address: string | null }> {
  const owner = input.adminUserId ? await adminUsers().findById(input.adminUserId) : undefined;
  if (owner === undefined) return { actor: { id: null, email: input.fallbackLabel }, address: null };
  return { actor: { id: null, email: owner.email }, address: owner.email };
}
