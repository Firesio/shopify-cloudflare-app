import { describe, expect, it } from "vitest";
import { directionOf, lookupChain, matchLanguage, negotiate, parseLanguageTag } from "./tag";

const SHIPPED = ["en", "es", "pt-BR"] as const;

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
    for (const junk of [undefined, null, 42, "", "  ", "!!", "en-", "x"]) expect(parseLanguageTag(junk)).toBeNull();
  });
});

describe("lookupChain", () => {
  const chain = (value: string) => {
    const tag = parseLanguageTag(value);
    return tag === null ? [] : lookupChain(tag);
  };
  it("goes from the most specific tag to the bare language", () => {
    expect(chain("zh-Hant-TW")).toEqual(["zh-Hant-TW", "zh-Hant", "zh-TW", "zh"]);
    expect(chain("es-MX")).toEqual(["es-MX", "es"]);
    expect(chain("es")).toEqual(["es"]);
  });
  it("drops extensions", () => {
    expect(chain("es-u-ca-gregory")).toEqual(["es"]);
  });
  it("is empty for the undetermined language", () => {
    expect(chain("und")).toEqual([]);
  });
});

describe("negotiate", () => {
  it("keeps what the old toLocale did for a shipped language", () => {
    expect(negotiate("es", SHIPPED, "en")).toBe("es");
    expect(negotiate("es-ES", SHIPPED, "en")).toBe("es");
    expect(negotiate("es-419", SHIPPED, "en")).toBe("es");
    expect(negotiate("en-GB", SHIPPED, "en")).toBe("en");
    expect(negotiate("ES-es", SHIPPED, "en")).toBe("es");
  });
  it("falls back for an unshipped language and for junk", () => {
    expect(negotiate("de-DE", SHIPPED, "en")).toBe("en");
    for (const junk of [undefined, null, 42, ""]) expect(negotiate(junk, SHIPPED, "en")).toBe("en");
  });
  it("prefers the most specific shipped tag", () => {
    expect(negotiate("pt-BR", SHIPPED, "en")).toBe("pt-BR");
    expect(negotiate("pt-PT", SHIPPED, "en")).toBe("en");
  });
  it("INTENTIONAL difference: an underscore tag now matches (it used to fall back to English)", () => {
    expect(negotiate("es_MX", SHIPPED, "en")).toBe("es");
  });
  it("matchLanguage says null instead of a fallback", () => {
    expect(matchLanguage("de", SHIPPED)).toBeNull();
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
