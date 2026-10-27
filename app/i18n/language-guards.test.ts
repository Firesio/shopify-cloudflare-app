import { describe, expect, it } from "vitest";

const sources = import.meta.glob("../**/*.{ts,tsx}", { eager: true, query: "?raw", import: "default" });

function filesUnder(prefixes: readonly string[]): [string, string][] {
  return Object.entries(sources).flatMap(([file, source]): [string, string][] =>
    typeof source === "string" && !/\.test\.tsx?$/.test(file) && prefixes.some((prefix) => file.startsWith(prefix)) ? [[file, source]] : [],
  );
}

describe("two audiences stay apart", () => {
  it("audience renders (emails, notifications, public pages) never read the request language themselves", () => {
    const forbidden = /i18n\.server|i18nServer|getFixedT|getLocale\b|getMerchantLanguage|searchParams\.get\(["']locale["']\)/;
    const offenders = filesUnder(["../emails/", "../notifications/", "../routes/public/"])
      .filter(([, source]) => forbidden.test(source))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
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
