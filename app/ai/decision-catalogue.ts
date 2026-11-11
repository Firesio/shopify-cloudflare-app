/**
 * The Workers AI DECISION models an admin may pick from, best first.
 *
 * Read from Cloudflare's model pages on 2026-11-11 and tried for real on 2026-11-11 (see
 * `docs/support-inbox.md`). A decision model scores a yes/no question as a probability instead of writing text, so
 * it has no place in `WORKERS_AI_MODELS` (`./catalogue`), whose entries are all generative.
 *
 * The ORDER is the recommendation: there is nothing to rank by. The text catalogue ranks on price and context
 * window, and Cloudflare publishes neither for `clef-flash`; inventing numbers to fill a comparator would make the
 * order look measured when it is not. `clef` first because its answers were the more decisive in a trial, and
 * `clef-flash` is the fallback that also answers faster.
 */
export interface DecisionModel {
  /** The Workers AI identifier, e.g. "@cf/cloudflare/clef". */
  readonly id: string;
  readonly label: string;
  /** What a person needs to judge it, from Cloudflare's own page. */
  readonly note: string;
}

export const DECISION_MODELS: readonly DecisionModel[] = [
  {
    id: "@cf/cloudflare/clef",
    label: "Clef",
    note: "Cloudflare's decision model · 64k context · $0.24 per M input tokens, nothing for output",
  },
  {
    id: "@cf/cloudflare/clef-flash",
    label: "Clef Flash",
    note: "The faster Clef · price and context not published",
  },
];

export function findDecisionModel(id: string): DecisionModel | undefined {
  return DECISION_MODELS.find((model) => model.id === id);
}
