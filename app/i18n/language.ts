/**
 * The language of a request. In the embedded admin Shopify puts its `locale` parameter on the request that LOADS the app;
 * there is no language switcher there (the app must not disagree with the admin around it). The app's own words are English
 * (`i18n/labels.ts`); a language is added by adding its labels object there, not by touching a page.
 */
const FALLBACK = "en";

export function localeOf(request: Request): string {
  const asked = new URL(request.url).searchParams.get("locale") ?? request.headers.get("accept-language")?.split(",")[0]?.split(";")[0]?.trim() ?? "";
  try {
    return Intl.getCanonicalLocales(asked)[0] ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** `en-GB` is `en`: the primary subtag picks the labels. */
export const languageOf = (locale: string): string => locale.split("-")[0] ?? FALLBACK;

const RTL = new Set(["ar", "he", "fa", "ur"]);
export const directionOf = (locale: string): "ltr" | "rtl" => (RTL.has(languageOf(locale)) ? "rtl" : "ltr");
