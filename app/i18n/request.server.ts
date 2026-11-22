import { localeIn } from "@firesio/app";
import { I18N } from "./index";

/**
 * The language of a request among the app's own (`?locale=`, the cookie, `Accept-Language`, by CLDR and script), and the translator for it. A `.server` module on purpose: React
 * Router drops it from the browser's bundle, and so the catalogue (`./index`) and the package's i18n with it. Imported by a route module for its loader alone, the same code in the
 * client would add the package's words and the app's catalogue to the script of EVERY embedded page (`scripts/bundle-budget.mjs` measures it).
 */
const localeOf = localeIn(I18N);

/** The request's language and the direction text runs in it (`<html lang dir>`). */
export function requestLanguage(request: Request): { readonly locale: string; readonly dir: "ltr" | "rtl" } {
  const locale = localeOf(request);
  return { locale, dir: I18N.direction(locale) };
}

/** The app's words in the request's language, for a page no shop is behind (the unsubscribe page): no member, no layer. */
export function requestTranslator(request: Request) {
  return I18N.translator(localeOf(request));
}
