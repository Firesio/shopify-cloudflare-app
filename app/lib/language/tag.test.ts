import { describe, expect, it } from "vitest";
import { languageTagSchema, parseLanguageTag } from "./tag";

describe("parseLanguageTag", () => {
  it("canonicalises case and underscores", () => {
    expect(parseLanguageTag("ES-es")).toBe("es-ES");
    expect(parseLanguageTag("pt_br")).toBe("pt-BR");
    expect(parseLanguageTag(" en ")).toBe("en");
  });
  it("maps legacy codes the way Intl does", () => {
    expect(parseLanguageTag("iw")).toBe("he");
  });
  it("is null for anything that is not a tag", () => {
    for (const junk of [undefined, null, 42, "", "  ", "!!", "en-", "x", "*", {}, [], "a".repeat(65)]) expect(parseLanguageTag(junk), String(junk)).toBeNull();
  });
});

describe("languageTagSchema (the edge for envelopes, forms and stored columns)", () => {
  it("parses to the same canonical tag and refuses what is not one", () => {
    expect(languageTagSchema.parse("es_MX")).toBe("es-MX");
    expect(languageTagSchema.safeParse("not a tag").success).toBe(false);
    expect(languageTagSchema.safeParse(5).success).toBe(false);
  });
});
