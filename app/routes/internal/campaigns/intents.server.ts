import { z } from "zod";
import { audienceFromForm } from "~/schemas/campaign";
import {
  cancelCampaign,
  createDraft,
  deleteDraft,
  pauseCampaign,
  resumeCampaign,
  sendTestCampaign,
  startCampaign,
  updateDraft,
  type CampaignActor,
  type CampaignDependencies,
  type ControlOutcome,
  type DraftInput,
  type DraftOutcome,
} from "~/services/campaigns.server";
import { paths } from "~/urls";
import { NOT_A_DRAFT, NOT_ALLOWED_NOW, NOT_FOUND, UNREADABLE, done, failed, invalidDraft, startResult, type HandlerOutcome } from "./outcomes";

/** What a handler is given. The id is the campaign the page is about, from the URL: never from the form. */
interface IntentContext {
  readonly form: FormData;
  readonly actor: CampaignActor;
  readonly id: string | undefined;
  readonly deps: CampaignDependencies;
}

type Handler = (context: IntentContext) => Promise<HandlerOutcome>;

export const INTENT_NAMES = ["save", "preview", "delete", "test", "start", "pause", "resume", "cancel"] as const;
export type Intent = (typeof INTENT_NAMES)[number];

/** The submitted intent, or undefined. A guard, not a cast: the value came off a form. */
export function readIntent(form: FormData): Intent | undefined {
  const value = form.get("intent");
  return INTENT_NAMES.find((name) => name === value);
}

const draftFieldsSchema = z.object({ name: z.string(), subject: z.string(), body: z.string(), ctaLabel: z.string(), ctaUrl: z.string() });

/** The editor's fields. Every one is always sent (an empty one means "none"), so a missing one is a forged request. */
function draftInputOf(form: FormData): DraftInput | undefined {
  const parsed = draftFieldsSchema.safeParse(Object.fromEntries(form));
  return parsed.success ? { ...parsed.data, audience: audienceFromForm(form) } : undefined;
}

const expectedSchema = z.string().regex(/^\d{1,9}$/).transform(Number);

function draftResult(outcome: DraftOutcome, created: boolean): HandlerOutcome {
  if (outcome.ok) return created ? { redirectTo: paths.internal.campaign(outcome.campaign.id) } : done("Draft saved.");
  if (outcome.reason === "invalid") return invalidDraft(outcome.errors);
  return failed(outcome.reason === "not_found" ? NOT_FOUND : NOT_A_DRAFT);
}

function controlResult(outcome: ControlOutcome, message: string): HandlerOutcome {
  if (outcome.ok) return done(message);
  return failed(outcome.reason === "not_found" ? NOT_FOUND : NOT_ALLOWED_NOW);
}

/** Wraps a handler that only makes sense for one campaign. */
function forCampaign(run: (context: IntentContext & { readonly id: string }) => Promise<HandlerOutcome>): Handler {
  return async (context) => (context.id === undefined ? failed(NOT_FOUND) : run({ ...context, id: context.id }));
}

const save: Handler = async ({ form, actor, id, deps }) => {
  const input = draftInputOf(form);
  if (input === undefined) return failed(UNREADABLE);
  const outcome = id === undefined ? await createDraft(actor, input, deps) : await updateDraft(actor, id, input, deps);
  return draftResult(outcome, id === undefined);
};

const preview: Handler = async ({ form, deps }) => ({ result: { kind: "preview", preview: await deps.audience.preview(audienceFromForm(form)) } });

const remove = forCampaign(async ({ actor, id, deps }) => {
  const outcome = await deleteDraft(actor, id, deps);
  if (outcome.ok) return { redirectTo: paths.internal.campaigns() };
  return failed(outcome.reason === "not_found" ? NOT_FOUND : NOT_A_DRAFT);
});

const test = forCampaign(async ({ actor, id, deps }) => {
  const outcome = await sendTestCampaign(actor, id, deps);
  if (!outcome.ok) return failed(NOT_FOUND);
  return outcome.delivered
    ? done(`A test was sent to ${actor.email}. Check your inbox.`)
    : failed("The test could not be delivered. Email sending may not be set up on this deployment.");
});

const start = forCampaign(async ({ form, actor, id, deps }) => {
  const expected = expectedSchema.safeParse(form.get("expectedRecipients"));
  if (!expected.success) return failed(UNREADABLE);
  const outcome = await startCampaign(actor, { id, expectedRecipients: expected.data }, deps);
  return startResult(outcome, expected.data);
});

const pause = forCampaign(async ({ actor, id, deps }) => controlResult(await pauseCampaign(actor, id, deps), "Paused. Nobody else will be written to until you resume."));
const resume = forCampaign(async ({ actor, id, deps }) => controlResult(await resumeCampaign(actor, id, deps), "Resumed. Sending continues with whoever is still waiting."));
const cancel = forCampaign(async ({ actor, id, deps }) => controlResult(await cancelCampaign(actor, id, deps), "Cancelled. Whoever was not written to yet will not receive it."));

/** Command dispatch: keyed by the union, so an intent cannot exist without its handler. */
export const INTENTS: Readonly<Record<Intent, Handler>> = { save, preview, delete: remove, test, start, pause, resume, cancel };
