import { describe, expect, it } from "vitest";
import { directionOf, lookupChain, matchLanguage, negotiate, parseLanguageTag } from "./tag";

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
    for (const junk of [undefined, null, 42, "", "  ", "!!", "en-", "x", {}, []]) expect(parseLanguageTag(junk)).toBeNull();
  });
});

describe("lookupChain (script-aware)", () => {
  const chain = (value: string) => {
    const tag = parseLanguageTag(value);
    return tag === null ? [] : lookupChain(tag);
  };
  it("follows CLDR parents, then truncation", () => {
    expect(chain("es-MX")).toEqual(["es-MX", "es-419", "es"]);
    expect(chain("pt-AO")).toEqual(["pt-AO", "pt-PT", "pt"]);
    expect(chain("en-AU")).toEqual(["en-AU", "en-001", "en"]);
    expect(chain("es")).toEqual(["es"]);
  });
  it("never leaves the requested script", () => {
    expect(chain("zh-TW")).toEqual(["zh-TW"]); // zh-TW IS zh-Hant-TW, so its own script-default is itself
    expect(chain("zh-Hans-SG")).toEqual(["zh-Hans-SG", "zh-Hans", "zh"]);
    expect(chain("zh-HK")).toEqual(["zh-HK", "zh-Hant"]);
  });
  it("stops at a script variant CLDR says does not inherit (sr-Latn)", () => {
    expect(chain("sr-Latn")).toEqual(["sr-Latn"]);
  });
  it("drops extensions and is empty for und", () => {
    expect(chain("es-u-ca-gregory")).toEqual(["es"]);
    expect(chain("und")).toEqual([]);
  });
});

describe("negotiate", () => {
  it("keeps what the old toLocale did for a shipped language", () => {
    const shipped = ["en", "es"];
    expect(negotiate("es", shipped, "en")).toBe("es");
    expect(negotiate("es-ES", shipped, "en")).toBe("es");
    expect(negotiate("es-419", shipped, "en")).toBe("es");
    expect(negotiate("en-GB", shipped, "en")).toBe("en");
    expect(negotiate("ES-es", shipped, "en")).toBe("es");
    expect(negotiate("es_MX", shipped, "en")).toBe("es");
  });

  it("falls back for an unshipped language, junk and und", () => {
    for (const junk of ["de-DE", undefined, null, 42, "", "und", "!!"]) expect(negotiate(junk, ["en", "es"], "en"), String(junk)).toBe("en");
  });

  it("prefers the exact region, then the CLDR parent, then the language default", () => {
    expect(negotiate("es-MX", ["en", "es", "es-MX"], "en")).toBe("es-MX");
    expect(negotiate("es-MX", ["en", "es", "es-419"], "en")).toBe("es-419");
    expect(negotiate("es-AR", ["en", "es", "es-419"], "en")).toBe("es-419");
    expect(negotiate("es-MX", ["en", "es"], "en")).toBe("es");
  });

  it("does not serve Simplified Chinese to Traditional readers (and the reverse)", () => {
    const simplified = ["en", "zh-CN"];
    expect(negotiate("zh-CN", simplified, "en")).toBe("zh-CN");
    expect(negotiate("zh", simplified, "en")).toBe("zh-CN");
    expect(negotiate("zh-Hans-SG", simplified, "en")).toBe("zh-CN");
    expect(negotiate("zh-TW", simplified, "en")).toBe("en");
    expect(negotiate("zh-HK", simplified, "en")).toBe("en");
    expect(negotiate("zh-Hant", simplified, "en")).toBe("en");
    const traditional = ["en", "zh-TW"];
    expect(negotiate("zh-TW", traditional, "en")).toBe("zh-TW");
    expect(negotiate("zh-HK", ["en", "zh-Hant"], "en")).toBe("zh-Hant");
    expect(negotiate("zh-CN", traditional, "en")).toBe("en");
  });

  it("handles Portuguese: Brazil is the default content, Portugal is its own", () => {
    expect(negotiate("pt-BR", ["en", "pt-BR"], "en")).toBe("pt-BR");
    expect(negotiate("pt", ["en", "pt-BR"], "en")).toBe("pt-BR");
    expect(negotiate("pt-PT", ["en", "pt-PT", "pt-BR"], "en")).toBe("pt-PT");
    expect(negotiate("pt-AO", ["en", "pt-PT", "pt-BR"], "en")).toBe("pt-PT");
    expect(negotiate("pt-BR", ["en", "pt-PT"], "en")).toBe("en");
  });

  it("does not match across scripts of one language (sr)", () => {
    expect(negotiate("sr-Latn", ["en", "sr"], "en")).toBe("en");
    expect(negotiate("sr", ["en", "sr"], "en")).toBe("sr");
    expect(negotiate("sr-Latn", ["en", "sr-Latn"], "en")).toBe("sr-Latn");
  });

  it("matchLanguage says null instead of a fallback", () => {
    expect(matchLanguage("de", ["en", "es"])).toBeNull();
  });
});

describe("directionOf", () => {
  it("reads the direction from the script", () => {
    for (const [code, direction] of [["ar", "rtl"], ["he", "rtl"], ["fa-IR", "rtl"], ["en", "ltr"], ["ja", "ltr"]] as const) {
      const tag = parseLanguageTag(code);
      expect(tag === null ? null : directionOf(tag), code).toBe(direction);
    }
  });
});
