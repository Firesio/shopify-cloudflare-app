import { createCookie } from "react-router";
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, type LanguageCode } from "./catalogues.generated";
import { languageCodeOf } from "./config";
import { merchantLanguage, type MerchantLanguage } from "./roles";
import { parseAcceptLanguage } from "~/lib/language/accept-language";
import { negotiate } from "~/lib/language/negotiate";
import { requestMemo } from "~/request-context.server";
import { parseLanguageTag, type LanguageTag } from "~/lib/language/tag";

/**
 * Cookie holding the visitor's chosen language on the PUBLIC pages. The name `locale` is a wire name (a cookie already in
 * a visitor's browser), kept as is.
 *
 * Not `httpOnly`: the language switcher is allowed to be a plain link, and there
 * is nothing secret in a language choice. One year, because a preference that
 * expires is worse than no preference.
 */
export const languageCookie = createCookie("locale", {
  path: "/",
  sameSite: "lax",
  httpOnly: false,
  maxAge: 60 * 60 * 24 * 365,
});

/** Which of the two audiences a request is for: the merchant inside the Shopify admin (`/app/**`), or everyone else. */
export type Surface = "admin" | "public";

export function surfaceOf(url: URL): Surface {
  return url.pathname === "/app" || url.pathname.startsWith("/app/") ? "admin" : "public";
}

function parsed(values: readonly unknown[]): readonly LanguageTag[] {
  return values.flatMap((value) => {
    const tag = parseLanguageTag(value);
    return tag === null ? [] : [tag];
  });
}

/**
 * What a request says about the language of whoever is reading, best first: `?lng=` (an explicit switch), the cookie (the
 * visitor's remembered choice), then the `Accept-Language` header by weight. This is the evidence for EVERY reader who is
 * not the merchant in Shopify's admin: public pages, the customer pages, mail built from a request.
 *
 * It never contains Shopify's `?locale=`: that is the language of the Shopify admin USER, which says nothing about a
 * customer or a visitor.
 */
export function requestEvidence(request: Request): Promise<readonly LanguageTag[]> {
  // Once per request: the page's language and every audience text built in the same request read the same evidence.
  return requestMemo("language:evidence", async () => {
    const url = new URL(request.url);
    const remembered: unknown = await languageCookie.parse(request.headers.get("Cookie"));
    return [...parsed([url.searchParams.get("lng"), remembered]), ...parseAcceptLanguage(request.headers.get("Accept-Language"))];
  });
}

/** Shopify's `locale` parameter, which the merchant's own screens obey. */
function shopifyLocale(request: Request): readonly LanguageTag[] {
  return parsed([new URL(request.url).searchParams.get("locale")]);
}

/** The shipped language for any one value (a form field, a stored column): the negotiator over one piece of evidence. */
export function languageOf(value: unknown): LanguageCode {
  return negotiate(parsed([value]), LANGUAGE_CODES, DEFAULT_LANGUAGE);
}

/**
 * The language the PAGE is drawn in for this request, which `<html lang>`, the server render and the browser share.
 *
 *  - Inside the Shopify admin (`/app/**`) the MERCHANT reads it: Shopify's `?locale=` is authoritative (the merchant
 *    already chose a language in Shopify and the app must match it), then the same evidence as everywhere else.
 *  - Everywhere else a VISITOR reads it: only `requestEvidence`. `?locale=` is ignored on purpose.
 *
 * Shopify sends regional tags (`es-ES`, `pt-BR`); the negotiator is script-aware and never answers `zh-TW` with Simplified.
 */
export function getLanguage(request: Request): Promise<LanguageCode> {
  // Once per request: the root loader and the entry both ask.
  return requestMemo("language:page", async () => {
    const evidence = await requestEvidence(request);
    const merchant = surfaceOf(new URL(request.url)) === "admin" ? shopifyLocale(request) : [];
    return negotiate([...merchant, ...evidence], LANGUAGE_CODES, DEFAULT_LANGUAGE);
  });
}

/**
 * The MERCHANT's language: Shopify's `locale` parameter and nothing else (no cookie, no `Accept-Language`, no `?lng`).
 * Code that renders for an end customer or any other reader gets an `AudienceText` instead and never this.
 */
export function getMerchantLanguage(request: Request): MerchantLanguage {
  return merchantLanguage(negotiate(shopifyLocale(request), LANGUAGE_CODES, DEFAULT_LANGUAGE));
}

/**
 * The merchant's language for something they SUBMIT. An in-app request may not carry Shopify's `?locale=` (a client
 * navigation drops it), so the form posts the language it was drawn in (`useLanguage()`); it is parsed exactly (a code we
 * wrote), and only when the form sent none does Shopify's parameter on this request decide.
 */
export function submittedMerchantLanguage(posted: unknown, request: Request): MerchantLanguage {
  const code = languageCodeOf(posted);
  return code === null ? getMerchantLanguage(request) : merchantLanguage(code);
}
