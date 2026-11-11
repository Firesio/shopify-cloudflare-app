import { findCatalogueModel } from "./catalogue";
import { findDecisionModel } from "./decision-catalogue";
import { isDecisionRole, type ModelRole } from "./roles";

/**
 * The label of a model, as long as it is one this purpose can use.
 *
 * `undefined` for an id the purpose's own catalogue does not list: a typo, a retired model, or a text model offered to
 * a decision purpose. Asking the purpose rather than both catalogues is what stops Clef being added to `writing`.
 */
export function modelLabel(role: ModelRole, modelId: string): string | undefined {
  const model = isDecisionRole(role) ? findDecisionModel(modelId) : findCatalogueModel(modelId);
  return model?.label;
}
