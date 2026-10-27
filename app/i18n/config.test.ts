import { describe, it, expect } from "vitest";
import { BROWSER_NAMESPACES, DEFAULT_LANGUAGE, LANGUAGE_CODES, LANGUAGES, NAMESPACES, NAMESPACE_KINDS } from "./catalogues.generated";
import { browserNamespaceOf, directionOf, languageCodeOf } from "./config";
import { resources } from "./resources";

describe("exact narrowing (for values WE wrote: <html lang>, a cookie we set)", () => {
  it("accepts a shipped language and nothing else", () => {
    expect(languageCodeOf("es")).toBe("es");
    expect(languageCodeOf("en")).toBe("en");
    for (const other of ["de", "es-ES", "ES", "", undefined, null, 7, {}]) expect(languageCodeOf(other), String(other)).toBeNull();
  });
  it("names the browser namespaces and refuses a server one", () => {
    expect(browserNamespaceOf("admin")).toBe("admin");
    expect(browserNamespaceOf("email")).toBeNull();
    expect(browserNamespaceOf("ext-whatever")).toBeNull();
  });
});

/** The direction as Intl says it (the typings do not know `getTextInfo` yet, so it is read through `Reflect`). */
function intlDirection(language: string): unknown {
  const locale = new Intl.Locale(language).maximize();
  const info: unknown = Reflect.apply(Reflect.get(locale, "getTextInfo"), locale, []);
  return typeof info === "object" && info !== null ? Reflect.get(info, "direction") : undefined;
}

describe("every shipped language is fully wired", () => {
  it("has a name, a script, a direction that Intl agrees with, and resources", () => {
    for (const language of LANGUAGE_CODES) {
      const facts = LANGUAGES[language];
      expect(facts.name, `name for ${language}`).toBeTruthy();
      expect(facts.script, `script for ${language}`).toBe(new Intl.Locale(language).maximize().script);
      expect(directionOf(language), `direction for ${language}`).toBe(intlDirection(language));
      expect(resources[language], `resources for ${language}`).toBeTruthy();
    }
  });
  it("derives the browser namespaces from the declaration, not from a name", () => {
    expect([...BROWSER_NAMESPACES]).toEqual(NAMESPACES.filter((namespace) => NAMESPACE_KINDS[namespace] === "browser"));
    expect(NAMESPACE_KINDS.email).toBe("server");
  });
  it("has a default language that ships", () => {
    expect(LANGUAGE_CODES).toContain(DEFAULT_LANGUAGE);
  });
});

/** Flatten to dotted key paths so two locales can be compared structurally. */
function keys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? keys(v as object, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("translation completeness", () => {
  const namespaces = NAMESPACES;

  it.each(namespaces)(
    "%s has identical keys in every language",
    (namespace) => {
      const base = keys(resources[DEFAULT_LANGUAGE][namespace]).sort();

      for (const language of LANGUAGE_CODES) {
        const other = keys(resources[language][namespace]).sort();
        // A missing key renders the raw key path to a merchant; an extra key is
        // dead weight that will drift.
        expect(other, `${language}/${namespace}`).toEqual(base);
      }
    },
  );

  it.each(namespaces)("%s has no empty strings", (namespace) => {
    for (const language of LANGUAGE_CODES) {
      const walk = (value: object, path = ""): void => {
        for (const [k, v] of Object.entries(value)) {
          if (typeof v === "object" && v !== null) walk(v as object, `${path}${k}.`);
          else
            expect(
              String(v).trim(),
              `${language}/${namespace} ${path}${k}`,
            ).not.toBe("");
        }
      };
      walk(resources[language][namespace]);
    }
  });

  it("keeps interpolation placeholders identical across locales", () => {
    // `{{shop}}` renamed in a translation silently renders the literal braces.
    const placeholders = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort();

    const walk = (base: object, other: object, path: string): void => {
      for (const [k, v] of Object.entries(base)) {
        const o = (other as Record<string, unknown>)[k];
        if (typeof v === "object" && v !== null) {
          walk(v as object, o as object, `${path}${k}.`);
        } else {
          expect(placeholders(String(o)), `${path}${k}`).toEqual(
            placeholders(String(v)),
          );
        }
      }
    };

    for (const language of LANGUAGE_CODES) {
      for (const ns of NAMESPACES) {
        walk(resources[DEFAULT_LANGUAGE][ns], resources[language][ns], `${language}/${ns} `);
      }
    }
  });
});
