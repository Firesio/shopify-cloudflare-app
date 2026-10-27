import type { InitOptions } from "i18next";
import { identity } from "~/identity";
import { DEFAULT_LOCALE, DEFAULT_NAMESPACE, NAMESPACES, SUPPORTED_LOCALES } from "./config";

/**
 * i18next options shared by the server and the browser, WITHOUT resources, so the browser bundle can import them without
 * pulling in every language. The server adds `resources` (`options.ts`); the browser adds the one language it needs
 * (`client-loaders.ts`). Both read the same values here, so they can never drift into rendering different text for
 * the same locale (which React would report as a hydration mismatch).
 */
export const baseI18nOptions = {
  supportedLngs: [...SUPPORTED_LOCALES],
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: DEFAULT_NAMESPACE,
  ns: [...NAMESPACES],
  // React already escapes interpolated values; letting i18next escape them too
  // double-encodes apostrophes and accents — visible in Spanish immediately.
  interpolation: { escapeValue: false, defaultVariables: { appName: identity.name } },
  returnNull: false,
} satisfies InitOptions;
