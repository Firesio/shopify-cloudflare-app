import { describe, expect, it } from "vitest";
import { findCatalogueModel } from "./catalogue";
import { DECISION_MODELS, findDecisionModel } from "./decision-catalogue";

describe("the decision catalogue", () => {
  it("has unique ids", () => {
    expect(new Set(DECISION_MODELS.map((model) => model.id)).size).toBe(DECISION_MODELS.length);
  });

  it("finds a model by id and nothing for an unknown one", () => {
    expect(findDecisionModel("@cf/cloudflare/clef")?.label).toBe("Clef");
    expect(findDecisionModel("@cf/typo/model")).toBeUndefined();
  });

  it("shares no id with the text catalogue, so a model is never offered for the wrong kind of purpose", () => {
    for (const model of DECISION_MODELS) expect(findCatalogueModel(model.id), model.id).toBeUndefined();
  });
});
