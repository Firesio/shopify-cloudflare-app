/**
 * What the app needs to know about its languages, small enough for the BROWSER to import. Pure — no I/O, no framework.
 *
 * The languages are NOT listed here: they are the folders under `locales/`, and `npm run i18n:sync` writes the generated
 * files from them (`catalogues.generated.ts`: `LANGUAGE_CODES`, `LanguageCode`, `LANGUAGES`, `NAMESPACES`, ...). Adding a
 * language is adding a folder (docs/i18n.md). Choosing a language for a request is the server's job (`negotiate`, in
 * `~/lib/language/negotiate`); the browser is told the language and never negotiates.
 */
import { BROWSER_NAMESPACES, LANGUAGE_CODES, LANGUAGES, type BrowserNamespace, type LanguageCode, type Namespace } from "./catalogues.generated";

export const DEFAULT_NAMESPACE: Namespace = "common";

/** The shipped language a value names exactly, else null. Not a negotiation: use it for values WE wrote (`<html lang>`, a cookie we set). */
export function languageCodeOf(value: unknown): LanguageCode | null {
  return LANGUAGE_CODES.find((code) => code === value) ?? null;
}

/** The browser namespace a value names, else null. */
export function browserNamespaceOf(value: unknown): BrowserNamespace | null {
  return BROWSER_NAMESPACES.find((namespace) => namespace === value) ?? null;
}

/** Writing direction of a shipped language (generated from Intl, never written by hand): `<html dir>` follows it. */
export function directionOf(language: LanguageCode): "ltr" | "rtl" {
  return LANGUAGES[language].direction;
}
