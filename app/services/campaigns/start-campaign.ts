import { isEditable } from "~/domain/campaign";
import { actorRef, type CampaignActor, type CampaignDependencies } from "./types";

export type StartOutcome =
  | { readonly ok: true; readonly recipients: number }
  | { readonly ok: false; readonly reason: "not_found" | "not_draft" | "no_recipients" | "changed" }
  /** The audience is not the size the caller was shown: `recipients` is what it is now. */
  | { readonly ok: false; readonly reason: "audience_changed"; readonly recipients: number };

/**
 * Sends an announcement: fixes who receives it, then starts the delivery chain.
 *
 * Starting is the one step that cannot be taken back, so it is the one that is checked hardest:
 *  - `expectedRecipients` is the number the caller was SHOWN. If the audience is a different size now (a shop installed,
 *    someone unsubscribed since the preview) nothing starts and the caller sees the new number, so what is approved is
 *    what is sent. An agent must pass it; the console passes the figure on its review screen.
 *  - the write is one atomic step that also checks the draft was not edited since it was read (`version`), so the words
 *    and the audience that go out are exactly the ones that were looked at.
 */
export async function startCampaign(
  actor: CampaignActor,
  input: { readonly id: string; readonly expectedRecipients: number | undefined },
  deps: CampaignDependencies,
): Promise<StartOutcome> {
  const campaign = await deps.store.find(input.id);
  if (campaign === undefined) return { ok: false, reason: "not_found" };
  if (!isEditable(campaign.status)) return { ok: false, reason: "not_draft" };

  const { recipients } = await deps.audience.preview(campaign.audience);
  if (recipients === 0) return { ok: false, reason: "no_recipients" };
  if (input.expectedRecipients !== undefined && input.expectedRecipients !== recipients) {
    return { ok: false, reason: "audience_changed", recipients };
  }

  const fixed = await deps.store.start({
    id: campaign.id,
    audience: campaign.audience,
    version: campaign.updatedAt,
    now: deps.runtime.clock.now(),
  });
  if (fixed === undefined) return { ok: false, reason: "changed" };
  deps.log({ event: "campaign.started", campaign: campaign.id, by: actorRef(actor), recipients: fixed });
  await scheduleNextStep(campaign.id, 0, deps);
  return { ok: true, recipients: fixed };
}

/**
 * Asks the queue for the next delivery step. A refusal is logged, not thrown: the campaign is already `sending` and the
 * watchdog restarts a chain that went quiet, so a person is never told "failed" about something that is in motion.
 */
export async function scheduleNextStep(campaignId: string, delaySeconds: number, deps: Pick<CampaignDependencies, "queue" | "log">): Promise<void> {
  try {
    await deps.queue.enqueue(campaignId, delaySeconds);
  } catch (cause) {
    deps.log({ event: "campaign.enqueue_failed", campaign: campaignId, reason: cause instanceof Error ? cause.name : "unknown" });
  }
}
