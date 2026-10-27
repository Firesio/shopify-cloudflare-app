import { describe, expect, it } from "vitest";
import { audienceLanguageOf, merchantLanguageOf } from "./roles";
import { createTranslator, isUnitComplete, resolveText, translateKey, type TextLayer, type TextUnits } from "./text";
import { outdatedKeys, sourceDigest, validateText } from "./text-validator";
import { identityContentLocalizer, shippedShopLanguages } from "./audience";
import { parseLanguageTag } from "./tag";

function layerOf(name: string, data: Record<string, Record<string, string>>): TextLayer {
  return {
    name,
    keys: (namespace) => Object.keys(data[namespace] ?? {}),
    get: (namespace, key) => data[namespace]?.[key],
  };
}

const BASE = { namespaces: ["m"], defaultNamespace: "m" } as const;
const KEYS = [{ namespace: "m", key: "a.b" }, { namespace: "m", key: "c" }];

describe("resolveText / isUnitComplete", () => {
  const top = layerOf("top", { m: { c: "top C" } });
  const bottom = layerOf("bottom", { m: { "a.b": "bottom AB", c: "bottom C" } });
  const units: TextUnits = { u: KEYS };

  it("the first layer that has a key wins", () => {
    expect(resolveText([top, bottom], "m", "c")).toBe("top C");
    expect(resolveText([top, bottom], "m", "a.b")).toBe("bottom AB");
    expect(resolveText([top], "m", "a.b")).toBeUndefined();
  });
  it("a unit is complete only when every key resolves; an unknown unit is not", () => {
    expect(isUnitComplete(units, "u", [top, bottom])).toBe(true);
    expect(isUnitComplete(units, "u", [top])).toBe(false);
    expect(isUnitComplete(units, "nope", [top, bottom])).toBe(false);
  });
});

describe("createTranslator", () => {
  it("holds only the unit's keys, with no fallback language", () => {
    const layer = layerOf("l", { m: { "a.b": "AB", c: "C", other: "not in the unit" } });
    const instance = createTranslator("es", [layer], KEYS, BASE);
    expect(translateKey(instance, "es", "m", "a.b")).toBe("AB");
    expect(translateKey(instance, "es", "m", "other")).toBe("other");
    expect(translateKey(instance, "es", "m", "missing")).toBe("missing");
  });

  it("never mutates what a layer hands it, and builds a fresh instance each time", () => {
    const data = { m: { "a.b": "AB", c: "C" } };
    const snapshot = JSON.stringify(data);
    const layer = layerOf("l", data);
    const first = createTranslator("en", [layer], KEYS, BASE);
    const second = createTranslator("en", [layerOf("o", { m: { "a.b": "override", c: "C" } }), layer], KEYS, BASE);
    expect(first).not.toBe(second);
    expect(translateKey(first, "en", "m", "a.b")).toBe("AB");
    expect(translateKey(second, "en", "m", "a.b")).toBe("override");
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it("treats layer text as data: no nesting, no unescaped values, no formatters", () => {
    const layer = layerOf("l", { m: { "a.b": "$t(m:c) {{- name}} {{name, uppercase}}", c: "SECRET" } });
    const out = translateKey(createTranslator("en", [layer], KEYS, BASE), "en", "m", "a.b", { name: "<b>x</b>" });
    expect(out).not.toContain("SECRET");
    expect(out).toContain("$t(m:c)");
    expect(out).not.toContain("<b>x</b>");
  });

  it("escapes interpolated values unless the caller's renderer already does", () => {
    const layer = layerOf("l", { m: { "a.b": "Hi {{name}}", c: "C" } });
    expect(translateKey(createTranslator("en", [layer], KEYS, BASE), "en", "m", "a.b", { name: "O'Brien <b>" })).toBe("Hi O&#39;Brien &lt;b&gt;");
    expect(translateKey(createTranslator("en", [layer], KEYS, { ...BASE, escapeValue: false }), "en", "m", "a.b", { name: "O'Brien" })).toBe("Hi O'Brien");
  });

  it("an empty string is missing, and a key naming the prototype is refused", () => {
    const layer = layerOf("l", { m: { "a.b": "", c: "C", "__proto__.polluted": "x", "constructor.prototype.p": "y" } });
    const instance = createTranslator("en", [layer], [...KEYS, { namespace: "m", key: "__proto__.polluted" }, { namespace: "m", key: "constructor.prototype.p" }], BASE);
    expect(translateKey(instance, "en", "m", "a.b")).toBe("a.b");
    expect(translateKey(instance, "en", "m", "c")).toBe("C");
    expect("polluted" in {}).toBe(false);
    expect("p" in {}).toBe(false);
  });

  it("uses default variables", () => {
    const layer = layerOf("l", { m: { "a.b": "From {{appName}}", c: "C" } });
    expect(translateKey(createTranslator("en", [layer], KEYS, { ...BASE, defaultVariables: { appName: "Acme" } }), "en", "m", "a.b")).toBe("From Acme");
  });
});

describe("two audiences, two types", () => {
  it("the merchant's language comes from Shopify's parameter, the reader's from evidence", () => {
    expect(merchantLanguageOf("es-ES", ["en", "es"], "en")).toBe("es");
    expect(merchantLanguageOf(null, ["en", "es"], "en")).toBe("en");
    expect(audienceLanguageOf([undefined, "de", "es-MX"], ["en", "es"], "en")).toBe("es");
    expect(audienceLanguageOf([], ["en", "es"], "en")).toBe("en");
  });
  it("defaults are the original text and the shipped languages", async () => {
    const tag = parseLanguageTag("es");
    expect(tag).not.toBeNull();
    if (tag === null) return;
    expect(await identityContentLocalizer.localize([{ kind: "k", id: "1", field: "f", original: "Hola" }], tag)).toEqual(["Hola"]);
    expect(await shippedShopLanguages(["en", "es"]).forShop("a.myshopify.com")).toEqual({ primary: null, available: ["en", "es"] });
  });
});

describe("validateText", () => {
  const spec = { allowed: ["name", "ticketNumber"], maxLength: 80 };
  const reason = (text: string, extra = {}) => {
    const verdict = validateText(text, { ...spec, ...extra });
    return verdict.ok ? "ok" : verdict.reason;
  };

  it("accepts plain text and allowed placeholders", () => {
    expect(reason("Hello {{name}}, ticket {{ ticketNumber }} is ready")).toBe("ok");
  });
  it("rejects the i18next syntax that is not plain placeholders", () => {
    expect(reason("Hi {{- name}}")).toBe("unescaped_placeholder");
    expect(reason("Hi $t(email:support.reply.cta)")).toBe("nesting");
    expect(reason("Hi {{name, uppercase}}")).toBe("formatted_placeholder");
    expect(reason("Hi {{secret}}")).toBe("unknown_placeholder");
    expect(reason("Hi {{name")).toBe("malformed_placeholder");
    expect(reason("Hi {{ na me }}")).toBe("malformed_placeholder");
    expect(reason("Hi }} there")).toBe("malformed_placeholder");
  });
  it("rejects control characters, line breaks on a single line, emptiness and length", () => {
    expect(reason("a\u0000b")).toBe("control_character");
    expect(reason("a\u0001b")).toBe("control_character");
    expect(reason("a\nb")).toBe("control_character");
    expect(reason("a\nb", { multiline: true })).toBe("ok");
    expect(reason("   ")).toBe("empty");
    expect(reason("x".repeat(81))).toBe("too_long");
    expect(reason("😀".repeat(80))).toBe("ok");
  });
  it("rejects a URL the source did not have", () => {
    expect(reason("see https://evil.example/x")).toBe("new_url");
    expect(reason("see www.evil.example")).toBe("new_url");
    expect(reason("see https://ok.example/a", { sourceText: "go to HTTPS://OK.example/a" })).toBe("ok");
  });
  it("rejects a text written against an older source", () => {
    expect(reason("fine", { digest: { given: "a", current: "b" } })).toBe("outdated");
    expect(reason("fine", { digest: { given: "a", current: "a" } })).toBe("ok");
  });
});

describe("sourceDigest", () => {
  it("is the SHA-256 hex of the UTF-8 text", async () => {
    expect(await sourceDigest("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sourceDigest("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("finds the keys written against older text", () => {
    const outdated = outdatedKeys(KEYS, (key) => (key.key === "c" ? "old" : undefined), () => "new");
    expect(outdated).toEqual([KEYS[1]]);
  });
});
