import { describe, expect, it } from "vitest";

const sources = import.meta.glob("../**/*.{ts,tsx}", { eager: true, query: "?raw", import: "default" });

function filesUnder(prefixes: readonly string[]): [string, string][] {
  return Object.entries(sources).flatMap(([file, source]): [string, string][] =>
    typeof source === "string" && !/\.test\.tsx?$/.test(file) && prefixes.some((prefix) => file.startsWith(prefix)) ? [[file, source]] : [],
  );
}

describe("two audiences stay apart", () => {
  it("audience renders (emails, notifications, public pages) never read the request language themselves", () => {
    const forbidden = /i18n\.server|getFixedT|getLanguage\b|getMerchantLanguage|requestEvidence|languageCookie|searchParams\.get\(["'](?:locale|lng)["']\)/;
    const offenders = filesUnder(["../emails/", "../notifications/", "../routes/public/", "../components/"])
      .filter(([, source]) => forbidden.test(source))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  // D7: Shopify's `?locale=` is the language of the admin user. The audience builder's only door to a request is `requestEvidence`.
  it("the audience builder reads a request only through requestEvidence, never Shopify's ?locale", () => {
    const source = String(sources["../wiring/audience.server.ts"]);
    expect(source).toContain("requestEvidence(request)");
    expect(source).not.toMatch(/getLanguage\b|getMerchantLanguage|["']locale["']/);
  });

  it("the only code that reads Shopify's `locale` parameter is the language server module", () => {
    const readers = filesUnder(["../"])
      .filter(([file]) => !/\.(?:generated)\./.test(file))
      .filter(([, source]) => /searchParams\.get\(\s*["']locale["']\s*\)|get\(\s*["']locale["']\s*\)/.test(source))
      .map(([file]) => file);
    expect(readers.filter((file) => !["../i18n/i18n.server.ts", "../routes/resources/locale.tsx"].includes(file))).toEqual([]);
  });

  it("admin routes and admin code never use the audience translator", () => {
    const forbidden = /wiring\/audience\.server|~\/i18n\/audience|AudienceText|audienceTextFor/;
    const offenders = filesUnder(["../routes/app/", "../admin/"])
      .filter(([, source]) => forbidden.test(source))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("the audience text is built in one place: the composition root", () => {
    const builders = filesUnder(["../"])
      .filter(([, source]) => /createTranslator\(/.test(source))
      .map(([file]) => file)
      .filter((file) => !file.startsWith("../lib/language/"));
    expect(builders).toEqual(["../wiring/audience.server.ts"]);
  });
});

describe("negotiation is server only", () => {
  // The CLDR table would otherwise be downloaded by every visitor. A `.server.ts` module cannot reach a
  // browser bundle; anything else may.
  it("no file that a browser can reach imports the negotiator, the CLDR table or the validator", () => {
    const serverOnly = /from\s+["'](?:~\/lib\/language\/(?:negotiate|parent-locales\.generated|text-validator)|\.{1,2}\/(?:negotiate|parent-locales\.generated))["']/;
    const offenders = filesUnder(["../"])
      .filter(([file]) => !file.endsWith(".server.ts") && !file.startsWith("../lib/language/"))
      .filter(([, source]) => serverOnly.test(source))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("remix-i18next is not used: the matched routes' namespaces are read by our own function", () => {
    expect(filesUnder(["../", "../../workers/"]).filter(([, source]) => source.includes("remix-i18next")).map(([file]) => file)).toEqual([]);
  });
});
