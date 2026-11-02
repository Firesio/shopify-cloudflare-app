import { isEditable, validateContent, type ContentError } from "~/domain/campaign";
import type { AudienceFilter } from "~/domain/campaign-audience";
import type { Campaign } from "~/ports/campaigns";
import { actorRef, type CampaignActor, type CampaignDependencies } from "./types";

/** What a person typed, before it is checked. Every field is a string: an empty one is how a form says "none". */
export interface DraftInput {
  readonly name: string;
  readonly subject: string;
  readonly body: string;
  readonly ctaLabel: string;
  readonly ctaUrl: string;
  readonly audience: AudienceFilter;
}

export type DraftOutcome =
  | { readonly ok: true; readonly campaign: Campaign }
  | { readonly ok: false; readonly reason: "invalid"; readonly errors: readonly ContentError[] }
  | { readonly ok: false; readonly reason: "not_found" | "not_draft" };

/** Checks the words, then writes a new draft. Nothing is sent and nobody is chosen: a draft only exists. */
export async function createDraft(actor: CampaignActor, input: DraftInput, deps: CampaignDependencies): Promise<DraftOutcome> {
  const checked = validateContent(input);
  if (!checked.ok) return { ok: false, reason: "invalid", errors: checked.errors };
  const campaign = await deps.store.create({
    id: deps.runtime.ids.uuid(),
    content: checked.value,
    audience: input.audience,
    createdBy: actor.id,
    createdByEmail: actor.email,
    now: deps.runtime.clock.now(),
  });
  deps.log({ event: "campaign.created", campaign: campaign.id, by: actorRef(actor) });
  return { ok: true, campaign };
}

/**
 * Replaces a draft's words and audience. Only a draft can change: once recipients are fixed, what was sent to them must
 * stay what was sent. The write itself is conditional on still being a draft, so a start that lands in between wins.
 */
export async function updateDraft(actor: CampaignActor, id: string, input: DraftInput, deps: CampaignDependencies): Promise<DraftOutcome> {
  const checked = validateContent(input);
  if (!checked.ok) return { ok: false, reason: "invalid", errors: checked.errors };
  const current = await deps.store.find(id);
  if (current === undefined) return { ok: false, reason: "not_found" };
  if (!isEditable(current.status)) return { ok: false, reason: "not_draft" };

  const written = await deps.store.updateDraft(id, checked.value, input.audience, deps.runtime.clock.now());
  if (!written) return { ok: false, reason: "not_draft" };
  const updated = await deps.store.find(id);
  if (updated === undefined) return { ok: false, reason: "not_found" };
  deps.log({ event: "campaign.updated", campaign: id, by: actorRef(actor) });
  return { ok: true, campaign: updated };
}

export type DeleteOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: "not_found" | "not_draft" };

/** Deletes a draft nobody was ever written to. A campaign that has started is cancelled instead, and kept as the record. */
export async function deleteDraft(actor: CampaignActor, id: string, deps: CampaignDependencies): Promise<DeleteOutcome> {
  const current = await deps.store.find(id);
  if (current === undefined) return { ok: false, reason: "not_found" };
  if (!isEditable(current.status)) return { ok: false, reason: "not_draft" };
  if (!(await deps.store.deleteDraft(id))) return { ok: false, reason: "not_draft" };
  deps.log({ event: "campaign.deleted", campaign: id, by: actorRef(actor) });
  return { ok: true };
}
