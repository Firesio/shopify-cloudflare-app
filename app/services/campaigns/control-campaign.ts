import { canTransition, type CampaignStatus } from "~/domain/campaign";
import { scheduleNextStep } from "./start-campaign";
import { actorRef, type CampaignActor, type CampaignDependencies } from "./types";

export type ControlOutcome =
  | { readonly ok: true; readonly status: CampaignStatus }
  /** `illegal`: the campaign is not in a state that allows this (a sent announcement cannot be cancelled). */
  | { readonly ok: false; readonly reason: "not_found" | "illegal" };

/** The one funnel for a person's move: the lifecycle says whether it is allowed, the store says whether it is still true. */
async function move(
  id: string,
  from: readonly CampaignStatus[],
  to: CampaignStatus,
  deps: CampaignDependencies,
): Promise<ControlOutcome> {
  const campaign = await deps.store.find(id);
  if (campaign === undefined) return { ok: false, reason: "not_found" };
  if (!from.includes(campaign.status) || !canTransition(campaign.status, to)) return { ok: false, reason: "illegal" };
  const moved = await deps.store.transition({ id, from: campaign.status, to, now: deps.runtime.clock.now() });
  return moved ? { ok: true, status: to } : { ok: false, reason: "illegal" };
}

/** Stops sending after the step in flight. Nothing is lost: the people still waiting keep their place for a resume. */
export async function pauseCampaign(actor: CampaignActor, id: string, deps: CampaignDependencies): Promise<ControlOutcome> {
  const outcome = await move(id, ["sending"], "paused", deps);
  if (outcome.ok) deps.log({ event: "campaign.paused", campaign: id, by: actorRef(actor) });
  return outcome;
}

/** Carries on from whoever is still waiting; also how a campaign the system paused (a bounce rate, no channel) is restarted. */
export async function resumeCampaign(actor: CampaignActor, id: string, deps: CampaignDependencies): Promise<ControlOutcome> {
  const outcome = await move(id, ["paused"], "sending", deps);
  if (!outcome.ok) return outcome;
  deps.log({ event: "campaign.resumed", campaign: id, by: actorRef(actor) });
  await scheduleNextStep(id, 0, deps);
  return outcome;
}

/**
 * Ends an announcement for good. Whoever has not been written to yet is marked skipped (so the report shows who did not
 * get it); whoever already got it keeps it, because a sent mail cannot be recalled. A step already in flight may finish
 * its current page.
 */
export async function cancelCampaign(actor: CampaignActor, id: string, deps: CampaignDependencies): Promise<ControlOutcome> {
  const outcome = await move(id, ["draft", "sending", "paused"], "cancelled", deps);
  if (!outcome.ok) return outcome;
  await deps.store.skipPending(id, deps.runtime.clock.now());
  deps.log({ event: "campaign.cancelled", campaign: id, by: actorRef(actor) });
  return outcome;
}
