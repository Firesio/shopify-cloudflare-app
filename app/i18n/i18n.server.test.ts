import { describe, it, expect } from "vitest";
import { getLanguage, getMerchantLanguage, languageCookie, requestEvidence } from "./i18n.server";

const url = (path: string) => `https://example.test${path}`;
const accept = (value: string) => ({ "Accept-Language": value });

describe("the language a PUBLIC page is drawn in (a visitor reads it)", () => {
  it("uses ?lng= on the public pages", async () => {
    expect(await getLanguage(new Request(url("/pricing?lng=es")))).toBe("es");
  });

  it("uses the cookie when no parameter is present", async () => {
    const request = new Request(url("/pricing"), { headers: { Cookie: await languageCookie.serialize("es") } });
    expect(await getLanguage(request)).toBe("es");
  });

  it("prefers ?lng= over the cookie", async () => {
    const request = new Request(url("/pricing?lng=en"), { headers: { Cookie: await languageCookie.serialize("es") } });
    expect(await getLanguage(request)).toBe("en");
  });

  it("falls back to Accept-Language, and to en with no signal or an unsupported one", async () => {
    expect(await getLanguage(new Request(url("/"), { headers: accept("es-ES,es;q=0.9,en;q=0.5") }))).toBe("es");
    expect(await getLanguage(new Request(url("/")))).toBe("en");
    expect(await getLanguage(new Request(url("/"), { headers: accept("de-DE,de;q=0.9") }))).toBe("en");
  });

  // D7: Shopify's `?locale=` is the language of the Shopify admin USER. A visitor or customer is someone else.
  it("never takes the language from Shopify's ?locale", async () => {
    for (const path of ["/?locale=es", "/pricing?locale=es", "/legal/terms?locale=es", "/auth/login?locale=es"]) {
      expect(await getLanguage(new Request(url(path), { headers: accept("en") })), path).toBe("en");
    }
    expect(await requestEvidence(new Request(url("/?locale=es")))).toEqual([]);
  });

  // B1: the page's language goes through the same script-aware negotiator as everything else.
  it("honours the weights of Accept-Language, not the order", async () => {
    expect(await getLanguage(new Request(url("/"), { headers: accept("en;q=0.4, es;q=0.9") }))).toBe("es");
  });

  it("answers a regional request with the base language but never with another script", async () => {
    expect(await getLanguage(new Request(url("/"), { headers: accept("es-MX") }))).toBe("es");
    // Only `en` and `es` ship: Traditional Chinese must not be answered with anything Chinese, and Latin Serbian not with Cyrillic.
    expect(await getLanguage(new Request(url("/"), { headers: accept("zh-TW,zh-CN;q=0.9") }))).toBe("en");
    expect(await getLanguage(new Request(url("/"), { headers: accept("sr-Latn") }))).toBe("en");
  });

  it("skips what it cannot serve for the next thing the reader said", async () => {
    expect(await getLanguage(new Request(url("/"), { headers: accept("de, fr;q=0.9, es;q=0.8") }))).toBe("es");
  });
});

describe("the language inside the Shopify admin (the merchant reads it)", () => {
  it("uses Shopify's `locale` parameter above everything else", async () => {
    // Apps rendered in the Shopify admin receive the merchant's chosen language in the `locale` request parameter, so it
    // must win, even against an explicit ?lng= and a cookie that say otherwise.
    const request = new Request(url("/app?locale=es&lng=en"), {
      headers: { Cookie: await languageCookie.serialize("en"), ...accept("en-US,en;q=0.9") },
    });
    expect(await getLanguage(request)).toBe("es");
    expect(await getLanguage(new Request(url("/app/support?locale=es")))).toBe("es");
  });

  it("accepts a regional tag from Shopify, and ignores an unsupported one rather than breaking", async () => {
    expect(await getLanguage(new Request(url("/app?locale=es-ES")))).toBe("es");
    expect(await getLanguage(new Request(url("/app?locale=de-DE")))).toBe("en");
  });

  it("does not take /application or /app-proxy for the admin", async () => {
    expect(await getLanguage(new Request(url("/application?locale=es")))).toBe("en");
    expect(await getLanguage(new Request(url("/app-proxy/status?locale=es")))).toBe("en");
  });

  it("the merchant's language for a stored value is Shopify's parameter and nothing else", () => {
    expect(getMerchantLanguage(new Request(url("/app?locale=es-MX&lng=en"), { headers: accept("en") }))).toEqual({ role: "merchant", code: "es" });
    expect(getMerchantLanguage(new Request(url("/app"), { headers: accept("es") }))).toEqual({ role: "merchant", code: "en" });
  });
});
