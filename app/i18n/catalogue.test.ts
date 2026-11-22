import { assertCatalogueComplete } from "@firesio/app/i18n/testing";
import { describe, expect, it } from "vitest";
import { CATALOGUE, FALLBACK_LANGUAGE, I18N } from "./index";

describe("the app's catalogue", () => {
  it("has every key of the source language in every language, with the same placeholders and plural forms", () => {
    expect(() => assertCatalogueComplete(CATALOGUE, { source: FALLBACK_LANGUAGE, languages: ["en", "es"], namespaces: ["app"] })).not.toThrow();
  });

  it("is two languages, the folders of app/i18n/locales", () => {
    expect([...I18N.languages].sort()).toEqual(["en", "es"]);
  });

  it("never reads a Spanish request as English by accident, and a language it lacks as the fallback", () => {
    expect(I18N.negotiate("es-MX")).toBe("es");
    expect(I18N.negotiate("fr")).toBeNull();
    expect(I18N.choose(["fr", "es"])).toBe("es");
  });
});
