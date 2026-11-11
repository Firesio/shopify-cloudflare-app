import { z } from "zod";
import type { TriageCandidate } from "~/support/triage/types";
import { SPAM_VERDICTS } from "~/support/triage/types";
import { buildSpamPrompt } from "../spam-prompt";
import { defineAiObjectTask } from "../task";

/**
 * One label for an inbound mail: legit, spam or unsure. The `classification` purpose exists for exactly this: a
 * closed set, the shortest and cheapest job there is.
 */
export const spamTriageTask = defineAiObjectTask<TriageCandidate, { readonly verdict: (typeof SPAM_VERDICTS)[number] }>({
  feature: "support.spam_triage",
  role: "classification",
  maxTokens: 30,
  schema: z.object({ verdict: z.enum(SPAM_VERDICTS) }),
  buildMessages: buildSpamPrompt,
});
