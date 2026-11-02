import { messagePayload } from "./payload";
import { actorRef, type CampaignActor, type CampaignDependencies } from "./types";

export type TestOutcome =
  | { readonly ok: true; readonly delivered: boolean }
  | { readonly ok: false; readonly reason: "not_found" };

/**
 * Sends the announcement to the person writing it, exactly as a merchant would read it, so they can check it before it
 * goes to everyone. Works at any stage, and the subject says it is a proof. It is not part of any delivery: it is not
 * deduplicated, not counted, and not sent to anyone else.
 */
export async function sendTestCampaign(actor: CampaignActor, id: string, deps: CampaignDependencies): Promise<TestOutcome> {
  const campaign = await deps.store.find(id);
  if (campaign === undefined) return { ok: false, reason: "not_found" };
  const link = await deps.unsubscribeUrl(actor.email);
  const payload = messagePayload({ ...campaign, subject: `[Test] ${campaign.subject}` }, "Your store (test)", link);
  const { delivered } = await deps.testMailer.send({ email: actor.email, payload });
  deps.log({ event: "campaign.test_sent", campaign: id, by: actorRef(actor) });
  return { ok: true, delivered };
}
