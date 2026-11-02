import type { CampaignContent, CampaignStatus } from "~/domain/campaign";
import type { AudienceFilter, AudiencePreview } from "~/domain/campaign-audience";
import type { MailOutcome, PauseReason, RecipientCounts } from "~/domain/campaign-delivery";
import type { CampaignMessagePayload } from "~/notifications/payloads";

/** What the use cases need to read and change a campaign. Implemented by `models/campaigns.server.ts`. */

export interface Campaign extends CampaignContent {
  readonly id: string;
  readonly audience: AudienceFilter;
  readonly status: CampaignStatus;
  readonly pauseReason: PauseReason | null;
  /** Fixed when sending starts; null for a draft. */
  readonly recipientCount: number | null;
  readonly createdBy: string | null;
  readonly createdByEmail: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly lastPumpAt: number | null;
}

/** One line of the campaign list: what a person scans, without the body. */
export interface CampaignSummary {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly status: CampaignStatus;
  readonly pauseReason: PauseReason | null;
  readonly recipientCount: number | null;
  readonly createdByEmail: string;
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
}

export type RecipientStatus = "pending" | "sent" | "failed" | "refused" | "skipped";
export type SettledStatus = Exclude<RecipientStatus, "pending">;

export interface CampaignRecipient {
  readonly shop: string;
  readonly shopName: string;
  readonly email: string;
  readonly status: RecipientStatus;
  readonly reasonCode: string | null;
  readonly attempts: number;
  readonly settledAt: number | null;
}

export interface CampaignStore {
  create(input: { id: string; content: CampaignContent; audience: AudienceFilter; createdBy: string | null; createdByEmail: string; now: number }): Promise<Campaign>;
  /** Replaces a DRAFT's content and audience. False when it is not a draft any more. */
  updateDraft(id: string, content: CampaignContent, audience: AudienceFilter, now: number): Promise<boolean>;
  /** Deletes a DRAFT. False when it is not one. */
  deleteDraft(id: string): Promise<boolean>;
  find(id: string): Promise<Campaign | undefined>;
  /** Newest first, bounded. */
  list(limit: number): Promise<readonly CampaignSummary[]>;
  /**
   * Moves a campaign from one status to another only if it is still in `from` (the lifecycle check is the caller's;
   * this is the race check). False when someone else moved it first.
   */
  transition(input: { id: string; from: CampaignStatus; to: CampaignStatus; now: number; pauseReason?: PauseReason | null }): Promise<boolean>;
  /**
   * Starts sending, in ONE atomic step: draft to sending, and the recipients fixed from `audience` as it is now.
   * `version` is the draft's `updatedAt` as the caller read it: if the draft was edited since, nothing happens, so the
   * audience that is sent to is always the one that was looked at. Returns how many recipients, or undefined when the
   * campaign was not that draft any more (started or edited by someone else).
   */
  start(input: { id: string; audience: AudienceFilter; version: number; now: number }): Promise<number | undefined>;
  counts(id: string): Promise<RecipientCounts>;
  recipients(id: string, input: { status?: RecipientStatus; limit: number }): Promise<readonly CampaignRecipient[]>;
  /** The next recipients still waiting, fewest attempts first. */
  nextPending(id: string, limit: number): Promise<readonly CampaignRecipient[]>;
  /** Records the outcome of a recipient that was still pending. A second settlement of the same one changes nothing. */
  settle(id: string, shop: string, status: SettledStatus, reasonCode: string | null, now: number): Promise<void>;
  /** A transient error: the recipient stays pending with one more attempt counted. */
  recordAttempt(id: string, shop: string): Promise<void>;
  /** Marks every recipient still waiting as skipped (the campaign was cancelled). Returns how many. */
  skipPending(id: string, now: number): Promise<number>;
  recordPump(id: string, now: number): Promise<void>;
  /** `sending` campaigns whose delivery chain has been quiet since before `quietBefore`. */
  stalled(quietBefore: number, limit: number): Promise<readonly string[]>;
}

export interface CampaignAudience {
  /** Who would receive an announcement with this filter, with the reasons some matches would not. */
  preview(filter: AudienceFilter): Promise<AudiencePreview>;
}

export interface CampaignUnsubscribes {
  /** Records the address. A second request for the same address is not an error. */
  add(address: string, source: "link" | "staff", now: number): Promise<void>;
  /** Of these addresses (any case), which are on the list. */
  among(addresses: readonly string[]): Promise<ReadonlySet<string>>;
}

export interface CampaignMailer {
  /** Sends one announcement to one merchant, through the one notification pipeline, deduplicated per campaign and shop. */
  send(input: { readonly campaignId: string; readonly shop: string; readonly email: string; readonly payload: CampaignMessagePayload }): Promise<MailOutcome>;
}

/**
 * Sends a proof to one address (the person writing it), in the caller's own request, so they learn whether it arrived.
 * Not deduplicated and not counted: it is not part of any delivery.
 */
export interface CampaignTestMailer {
  send(input: { readonly email: string; readonly payload: CampaignMessagePayload }): Promise<{ readonly delivered: boolean }>;
}

/** Schedules the next delivery step. Rejects when the queue refuses it; callers decide how to degrade. */
export interface CampaignPumpQueue {
  enqueue(campaignId: string, delaySeconds: number): Promise<void>;
}
