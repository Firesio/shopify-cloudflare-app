import { describe, expect, it } from "vitest";
import { createTranslator, deepFreeze, isUnitComplete, resolveText, translateKey, type TextKey, type TextLayer, type TextUnits } from "./text";
import { identityContentLocalizer, shippedShopLanguages } from "./audience";

function layerOf(name: string, data: Record<string, Record<string, string>>): TextLayer {
  return { name, get: (namespace, key) => data[namespace]?.[key] };
}

const BASE = { namespaces: ["m"], defaultNamespace: "m" } as const;
const KEYS: readonly TextKey[] = [{ namespace: "m", key: "a.b" }, { namespace: "m", key: "c" }];

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
    expect(isUnitComplete(units, "u", [top, bottom], "en")).toBe(true);
    expect(isUnitComplete(units, "u", [top], "en")).toBe(false);
    expect(isUnitComplete(units, "nope", [top, bottom], "en")).toBe(false);
  });

  // B4: "has text" is defined once. An empty string is not text, so it is neither complete nor a shadow.
  it("an empty string is missing: not complete, and it does not hide the layer below", () => {
    const blank = layerOf("blank", { m: { "a.b": "", c: "" } });
    expect(resolveText([blank], "m", "c")).toBeUndefined();
    expect(isUnitComplete({ u: KEYS }, "u", [blank], "en")).toBe(false);
    expect(resolveText([blank, bottom], "m", "c")).toBe("bottom C");
    expect(isUnitComplete({ u: KEYS }, "u", [blank, bottom], "en")).toBe(true);
  });
  it("an empty string never renders as an empty string or as the key of a unit that was called complete", () => {
    const blank = layerOf("blank", { m: { "a.b": "", c: "C" } });
    expect(isUnitComplete({ u: KEYS }, "u", [blank], "en")).toBe(false);
  });
});

// B5: a plural key is a GROUP; its strings are one per category of the language.
describe("plural groups in a unit", () => {
  const units: TextUnits = { u: [{ namespace: "m", key: "items", plural: true }] };
  const english = layerOf("en", { m: { items_one: "{{count}} item", items_other: "{{count}} items" } });
  const arabic = layerOf("ar", { m: { items_zero: "z", items_one: "o", items_two: "t", items_few: "f", items_many: "m", items_other: "x" } });

  it("is complete in English with two forms and in Arabic only with all six", () => {
    expect(isUnitComplete(units, "u", [english], "en")).toBe(true);
    expect(isUnitComplete(units, "u", [english], "ar")).toBe(false);
    expect(isUnitComplete(units, "u", [arabic], "ar")).toBe(true);
  });
  it("is incomplete when one category is missing", () => {
    expect(isUnitComplete(units, "u", [layerOf("x", { m: { items_other: "x" } })], "en")).toBe(false);
  });
  it("renders the form for the count, with the count as a placeholder", () => {
    const keys = units.u ?? [];
    const instance = createTranslator("en", [english], keys, BASE);
    expect(translateKey(instance, "en", "m", "items", {}, 1)).toBe("1 item");
    expect(translateKey(instance, "en", "m", "items", {}, 5)).toBe("5 items");
    const arabicInstance = createTranslator("ar", [arabic], keys, BASE);
    expect(translateKey(arabicInstance, "ar", "m", "items", {}, 2)).toBe("t");
    expect(translateKey(arabicInstance, "ar", "m", "items", {}, 11)).toBe("m");
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

  it("treats layer text as data: no nesting, no unescaped values", () => {
    const layer = layerOf("l", { m: { "a.b": "$t(m:c) {{- name}}", c: "SECRET" } });
    const out = translateKey(createTranslator("en", [layer], KEYS, BASE), "en", "m", "a.b", { name: "<b>x</b>" });
    expect(out).not.toContain("SECRET");
    expect(out).toContain("$t(m:c)");
    expect(out).not.toContain("<b>x</b>");
  });

  // i18next ships real formatters (`number`, `currency`, `datetime`, `list`...). A merchant string must not be able to run one.
  it("runs no formatter: `{{n, number}}` and `{{n, currency(USD)}}` stay as written", () => {
    const layer = layerOf("l", { m: { "a.b": "{{n, number}} | {{n, currency(USD)}}", c: "C" } });
    const instance = createTranslator("en", [layer], KEYS, BASE);
    expect(instance.services.formatter?.format(1234567, "number", "en")).toBe("1,234,567"); // the formatter exists and WOULD run
    const out = translateKey(instance, "en", "m", "a.b", { n: 1234567 });
    expect(out).not.toContain("1,234,567");
    expect(out).not.toContain("$1,234,567");
    expect(out).toContain("{{n, number}}");
  });

  it("escapes interpolated values unless the caller's renderer already does", () => {
    const layer = layerOf("l", { m: { "a.b": "Hi {{name}}", c: "C" } });
    expect(translateKey(createTranslator("en", [layer], KEYS, BASE), "en", "m", "a.b", { name: "O'Brien <b>" })).toBe("Hi O&#39;Brien &lt;b&gt;");
    expect(translateKey(createTranslator("en", [layer], KEYS, { ...BASE, escapeValue: false }), "en", "m", "a.b", { name: "O'Brien" })).toBe("Hi O'Brien");
  });

  // D2: keys are flat, so `x` and `x.y` are two unrelated keys, and a key that names a prototype is only a name.
  it("keeps `x` and `x.y` apart, and a prototype-shaped key is just a name", () => {
    const keys: readonly TextKey[] = [
      { namespace: "m", key: "x" }, { namespace: "m", key: "x.y" },
      { namespace: "m", key: "__proto__.polluted" }, { namespace: "m", key: "constructor.prototype.p" },
    ];
    const layer = layerOf("l", { m: { x: "X", "x.y": "XY", "__proto__.polluted": "p1", "constructor.prototype.p": "p2" } });
    const instance = createTranslator("en", [layer], keys, BASE);
    expect(translateKey(instance, "en", "m", "x")).toBe("X");
    expect(translateKey(instance, "en", "m", "x.y")).toBe("XY");
    expect(translateKey(instance, "en", "m", "__proto__.polluted")).toBe("p1");
    expect("polluted" in {}).toBe(false);
    expect("p" in {}).toBe(false);
  });

  // D1: placeholder values and i18next options live apart, so a value named like an option cannot steer the lookup.
  it("a value named like an i18next option is just a value", () => {
    const layer = layerOf("l", { m: { "a.b": "Hi {{lng}} {{ns}} {{context}}", c: "C" } });
    const out = translateKey(createTranslator("en", [layer], KEYS, BASE), "en", "m", "a.b", { lng: "fr", ns: "other", context: "male" });
    expect(out).toBe("Hi fr other male");
  });

  it("uses default variables", () => {
    const layer = layerOf("l", { m: { "a.b": "From {{appName}}", c: "C" } });
    expect(translateKey(createTranslator("en", [layer], KEYS, { ...BASE, defaultVariables: { appName: "Acme" } }), "en", "m", "a.b")).toBe("From Acme");
  });
});

describe("deepFreeze", () => {
  it("freezes every level, so a shared catalogue cannot be changed by any request", () => {
    const shared = deepFreeze({ en: { common: { hello: "Hi" } } });
    expect(Object.isFrozen(shared.en.common)).toBe(true);
    expect(() => {
      Reflect.set(shared.en.common, "hello", "Hacked");
    }).not.toThrow();
    expect(shared.en.common.hello).toBe("Hi");
    expect(Reflect.set(shared.en.common, "hello", "Hacked")).toBe(false);
  });
});

describe("a string the validator approves renders as plain text", () => {
  it("through a real translator, with its values escaped and nothing evaluated", async () => {
    const { validateText } = await import("./text-validator");
    const approved = ["Hello {{name}}, ticket {{ticketNumber}} is ready", "Visit https://shop.com/help. Thanks {{name}}!", "Costs 4.99 {{name}}"];
    for (const text of approved) expect(validateText(text, { allowed: ["name", "ticketNumber"], maxLength: 200, sourceText: "https://shop.com/help" }).ok, text).toBe(true);
    const layer = layerOf("l", { m: { "a.b": approved[0] ?? "", c: approved[1] ?? "" } });
    const instance = createTranslator("en", [layer], KEYS, BASE);
    expect(translateKey(instance, "en", "m", "a.b", { name: "<b>O'Brien</b>", ticketNumber: 7 })).toBe("Hello &lt;b&gt;O&#39;Brien&lt;&#x2F;b&gt;, ticket 7 is ready");
    expect(translateKey(instance, "en", "m", "c", { name: "x" })).toBe("Visit https://shop.com/help. Thanks x!");
  });
});

describe("deepFreeze reaches under frozen objects", () => {
  it("freezes a child that sits inside an already frozen parent, and survives a cycle", () => {
    const child = { leaf: { value: 1 } };
    const parent = Object.freeze({ child });
    deepFreeze(parent);
    expect(Object.isFrozen(child)).toBe(true);
    expect(Object.isFrozen(child.leaf)).toBe(true);
    const loop: { self?: object } = {};
    loop.self = loop;
    expect(() => deepFreeze(loop)).not.toThrow();
  });
});

describe("defaults an app replaces", () => {
  it("return the original text, one piece at a time, and the shipped languages", async () => {
    expect(await identityContentLocalizer<"es">().localize({ kind: "k", id: "1", field: "f", original: "Hola" }, "es")).toBe("Hola");
    expect(await shippedShopLanguages(["en", "es"]).forShop("a.myshopify.com")).toEqual({ primary: null, available: ["en", "es"] });
  });
});
