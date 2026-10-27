import { describe, expect, it } from "vitest";
import { negotiate } from "./negotiate";
import { parseLanguageTag, type LanguageTag } from "./tag";

/** Evidence as the edge produces it: parsed tags, best first. */
function evidence(...values: readonly unknown[]): readonly LanguageTag[] {
  return values.flatMap((value) => {
    const tag = parseLanguageTag(value);
    return tag === null ? [] : [tag];
  });
}
const pick = (requested: string, available: readonly string[], fallback = "en") => negotiate(evidence(requested), available, fallback);

describe("negotiate", () => {
  it("serves a regional request with the base language", () => {
    const shipped = ["en", "es"];
    for (const [requested, expected] of [["es", "es"], ["es-ES", "es"], ["es-419", "es"], ["en-GB", "en"], ["ES-es", "es"], ["es_MX", "es"]]) {
      expect(pick(requested ?? "", shipped), requested).toBe(expected);
    }
  });

  it("falls back for an unshipped language, junk and und", () => {
    for (const junk of ["de-DE", undefined, null, 42, "", "und", "!!"]) expect(negotiate(evidence(junk), ["en", "es"], "en"), String(junk)).toBe("en");
    expect(negotiate([], ["en", "es"], "es")).toBe("es");
  });

  it("takes the first piece of evidence that matches, not the first piece", () => {
    expect(negotiate(evidence("de", "fr", "es-MX", "en"), ["en", "es"], "en")).toBe("es");
  });

  it("prefers the exact region, then the CLDR parent, then the language default", () => {
    expect(pick("es-MX", ["en", "es", "es-MX"])).toBe("es-MX");
    expect(pick("es-MX", ["en", "es", "es-419"])).toBe("es-419");
    expect(pick("es-AR", ["en", "es", "es-419"])).toBe("es-419");
    expect(pick("es-MX", ["en", "es"])).toBe("es");
  });

  // B2: the same language in the same script, only another region, is far better than English.
  it("serves another region of the same language and script before English", () => {
    expect(pick("es", ["en", "es-MX"])).toBe("es-MX");
    expect(pick("es-ES", ["en", "es-419"])).toBe("es-419");
    expect(pick("fr-FR", ["en", "fr-CA"])).toBe("fr-CA");
    expect(pick("pt-BR", ["en", "pt-PT"])).toBe("pt-PT");
  });

  it("chooses among sibling regions by code, never by the order they were listed in", () => {
    expect(pick("es-ES", ["en", "es-MX", "es-AR"])).toBe(pick("es-ES", ["en", "es-AR", "es-MX"]));
    expect(pick("es-ES", ["en", "es-MX", "es-AR"])).toBe("es-AR");
  });

  it("does not serve Simplified Chinese to Traditional readers (and the reverse)", () => {
    const simplified = ["en", "zh-CN"];
    expect(pick("zh-CN", simplified)).toBe("zh-CN");
    expect(pick("zh", simplified)).toBe("zh-CN");
    expect(pick("zh-Hans-SG", simplified)).toBe("zh-CN");
    expect(pick("zh-TW", simplified)).toBe("en");
    expect(pick("zh-HK", simplified)).toBe("en");
    expect(pick("zh-Hant", simplified)).toBe("en");
    const traditional = ["en", "zh-TW"];
    expect(pick("zh-TW", traditional)).toBe("zh-TW");
    expect(pick("zh-HK", ["en", "zh-Hant"])).toBe("zh-Hant");
    expect(pick("zh-CN", traditional)).toBe("en");
  });

  it("handles Portuguese: Brazil is the default content, Portugal is its own", () => {
    expect(pick("pt-BR", ["en", "pt-BR"])).toBe("pt-BR");
    expect(pick("pt", ["en", "pt-BR"])).toBe("pt-BR");
    expect(pick("pt-PT", ["en", "pt-PT", "pt-BR"])).toBe("pt-PT");
    expect(pick("pt-AO", ["en", "pt-PT", "pt-BR"])).toBe("pt-PT");
  });

  it("does not match across scripts of one language (sr)", () => {
    expect(pick("sr-Latn", ["en", "sr"])).toBe("en");
    expect(pick("sr", ["en", "sr"])).toBe("sr");
    expect(pick("sr-Latn", ["en", "sr-Latn"])).toBe("sr-Latn");
    expect(pick("sr", ["en", "sr-Latn"])).toBe("en");
  });

  it("drops extensions", () => {
    expect(pick("es-u-ca-gregory", ["en", "es"])).toBe("es");
  });

  // Documented limit (docs/i18n.md): CLDR keeps `no` and `nb` as separate locales and Intl does not alias one to the other,
  // so a ship of `nb` alone does not serve `no`. Ship the tag the audience sends (`no`), or both.
  it("does not treat Norwegian `no` and `nb` as one language", () => {
    expect(pick("no", ["en", "nb"])).toBe("en");
    expect(pick("no", ["en", "no"])).toBe("no");
  });
});
