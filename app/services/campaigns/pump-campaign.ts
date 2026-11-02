import type { CampaignStatus } from "~/domain/campaign";
import {
  EMPTY_TALLY,
  PUMP_BACKOFF_SECONDS,
  PUMP_GAP_SECONDS,
  PUMP_PAGE_SIZE,
  judgePage,
  settlementOf,
  type PageTally,
  type PauseReason,
} from "~/domain/campaign-delivery";
import type { Campaign, CampaignRecipient } from "~/ports/campaigns";
import { messagePayload } from "./payload";
import type { CampaignDependencies } from "./types";

export type PumpResult =
  | { readonly kind: "gone" }
  /** Not `sending` (paused, cancelled, finished): the chain ends here, and resuming starts a new one. */
  | { readonly kind: "idle"; readonly status: CampaignStatus }
  | { readonly kind: "continued"; readonly delaySeconds: number }
  | { readonly kind: "finished" }
  | { readonly kind: "paused"; readonly reason: PauseReason };

/**
 * One step of delivery: send one page of the people still waiting, then schedule the next step.
 *
 * Safe to run twice for the same page (a queue redelivers): every mail carries a dedupe key per campaign and shop, and a
 * recipient is settled only while still pending, so a replay sends nothing twice. A step that throws (the queue refusing
 * the next step, D1 going away) is simply run again by the queue and picks up whoever is still pending, so progress is
 * never lost and never repeated.
 *
 * Whether to carry on is `judgePage`'s call (pure). Stopping is for what gets worse with every mail: no mail channel at
 * all, or most of a meaningful sample bouncing.
 */
export async function pumpCampaign(campaignId: string, deps: CampaignDependencies): Promise<PumpResult> {
  const campaign = await deps.store.find(campaignId);
  if (campaign === undefined) return { kind: "gone" };
  if (campaign.status !== "sending") return { kind: "idle", status: campaign.status };

  const page = await deps.store.nextPending(campaign.id, PUMP_PAGE_SIZE);
  if (page.length === 0) return finish(campaign, deps);

  const tally = await sendPage(campaign, page, deps);
  await deps.store.recordPump(campaign.id, deps.runtime.clock.now());

  const verdict = judgePage(tally);
  deps.log({ event: "campaign.page", campaign: campaign.id, tally, next: verdict.next });
  if (verdict.next === "pause") return pause(campaign, verdict.reason, deps);

  const delaySeconds = verdict.next === "back_off" ? PUMP_BACKOFF_SECONDS : PUMP_GAP_SECONDS;
  // Not swallowed, unlike a first step: a refusal fails this step so the queue runs it again.
  await deps.queue.enqueue(campaign.id, delaySeconds);
  return { kind: "continued", delaySeconds };
}

async function sendPage(campaign: Campaign, page: readonly CampaignRecipient[], deps: CampaignDependencies): Promise<PageTally> {
  const unsubscribed = await deps.unsubscribes.among(page.map((recipient) => recipient.email));
  let tally: PageTally = EMPTY_TALLY;
  for (const recipient of page) {
    const counted = unsubscribed.has(recipient.email)
      ? await skipUnsubscribed(campaign.id, recipient, deps)
      : await sendOne(campaign, recipient, deps);
    tally = { ...tally, [counted]: tally[counted] + 1 };
    // The channel is not set up: every recipient would be told the same, so stop asking.
    if (counted === "unavailable") break;
  }
  return tally;
}

async function skipUnsubscribed(campaignId: string, recipient: CampaignRecipient, deps: CampaignDependencies): Promise<keyof PageTally> {
  await deps.store.settle(campaignId, recipient.shop, "skipped", "unsubscribed", deps.runtime.clock.now());
  return "skipped";
}

async function sendOne(campaign: Campaign, recipient: CampaignRecipient, deps: CampaignDependencies): Promise<keyof PageTally> {
  const link = await deps.unsubscribeUrl(recipient.email);
  const outcome = await deps.mailer.send({
    campaignId: campaign.id,
    shop: recipient.shop,
    email: recipient.email,
    payload: messagePayload(campaign, recipient.shopName, link),
  });
  const settlement = settlementOf(outcome, recipient.attempts);
  switch (settlement.action) {
    case "settle":
      await deps.store.settle(campaign.id, recipient.shop, settlement.status, settlement.reasonCode, deps.runtime.clock.now());
      break;
    case "retry":
      await deps.store.recordAttempt(campaign.id, recipient.shop);
      break;
    case "hold":
      break;
  }
  return settlement.counts;
}

async function pause(campaign: Campaign, reason: PauseReason, deps: CampaignDependencies): Promise<PumpResult> {
  const moved = await deps.store.transition({ id: campaign.id, from: "sending", to: "paused", now: deps.runtime.clock.now(), pauseReason: reason });
  if (moved) deps.log({ event: "campaign.paused_by_system", campaign: campaign.id, reason });
  return { kind: "paused", reason };
}

async function finish(campaign: Campaign, deps: CampaignDependencies): Promise<PumpResult> {
  const moved = await deps.store.transition({ id: campaign.id, from: "sending", to: "sent", now: deps.runtime.clock.now() });
  if (!moved) return { kind: "idle", status: (await deps.store.find(campaign.id))?.status ?? "cancelled" };
  deps.log({ event: "campaign.finished", campaign: campaign.id, counts: await deps.store.counts(campaign.id) });
  return { kind: "finished" };
}
