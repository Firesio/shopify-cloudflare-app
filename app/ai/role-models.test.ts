import { describe, expect, it } from "vitest";
import { modelLabel } from "./role-models";

describe("the label of a model for a purpose", () => {
  it("knows a text model for a text purpose and a decision model for a decision purpose", () => {
    expect(modelLabel("writing", "@cf/openai/gpt-oss-120b")).toBeDefined();
    expect(modelLabel("decision", "@cf/cloudflare/clef")).toBe("Clef");
  });

  it("refuses a model of the other kind, so a decision model is never added to a writing purpose", () => {
    expect(modelLabel("writing", "@cf/cloudflare/clef")).toBeUndefined();
    expect(modelLabel("decision", "@cf/openai/gpt-oss-120b")).toBeUndefined();
  });

  it("refuses an id in neither catalogue", () => {
    expect(modelLabel("decision", "@cf/typo/model")).toBeUndefined();
  });
});
