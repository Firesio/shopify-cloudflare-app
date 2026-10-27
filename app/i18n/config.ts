/**
 * i18n configuration. Pure — no I/O, no framework, importable from anywhere (the browser included).
 *
 * The languages are NOT listed here: they are the folders under `locales/`, and `npm run i18n:sync` writes
 * `catalogues.generated.ts` from them. Adding a language is adding a folder (docs/i18n.md).
 */
import { CATALOGUE_CODES, CATALOGUE_NAMESPACES, LANGUAGE_DIRECTIONS, LANGUAGE_NAMES } from "./catalogues.generated";
import { matchLanguage, negotiate } from "~/lib/language/tag";

/** Every locale the app ships. `en` first: it is the fallback and the key source. */
export const SUPPORTED_LOCALES = CATALOGUE_CODES;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Namespaces split by surface (one JSON file each), so the embedded admin bundle does not ship marketing and legal
 * copy (and vice versa). The template's: `common` (everywhere), `public` (landing, pricing, legal, support), `admin`
 * (the embedded Shopify admin) and `email` (rendered on the server, never sent to a browser).
 */
export const NAMESPACES = CATALOGUE_NAMESPACES;

export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE: Namespace = "common";

/**
 * Namespaces a browser never needs: mail is rendered on the server, and an `ext-*` namespace only feeds a Shopify
 * extension's own locale files.
 */
export function isServerOnlyNamespace(namespace: string): boolean {
  return namespace === "email" || namespace.startsWith("ext-");
}

export const BROWSER_NAMESPACES: readonly Namespace[] = NAMESPACES.filter((ns) => !isServerOnlyNamespace(ns));

/** Human names for the language switcher, each written in its own language (from each `language.json`). */
export const LOCALE_LABELS: Readonly<Record<Locale, string>> = LANGUAGE_NAMES;

/** Writing direction, from each `language.json`: `<html dir>` follows it, so an RTL language is just a folder. */
export const LOCALE_DIRECTION: Readonly<Record<Locale, "ltr" | "rtl">> = LANGUAGE_DIRECTIONS;

/** Narrow an untrusted string (query param, cookie, header) to a Locale. */
export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    SUPPORTED_LOCALES.some((locale) => locale === value)
  );
}

/**
 * The shipped locale for anything a request, cookie, header or database row can hold.
 *
 * Shopify sends regional tags in the admin's `locale` parameter (`es-ES`, `pt-BR`), so the lookup chain tries the most
 * specific tag first and then its base language; otherwise a Spanish merchant silently gets English.
 */
export function negotiateLocale(value: unknown): Locale {
  return negotiate(value, SUPPORTED_LOCALES, DEFAULT_LOCALE);
}

/** Like `negotiateLocale`, but null when the value names no shipped language. */
export function matchLocale(value: unknown): Locale | null {
  return matchLanguage(value, SUPPORTED_LOCALES);
}
