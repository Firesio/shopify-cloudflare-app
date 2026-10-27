import type { InitOptions } from "i18next";
import { identity } from "~/identity";
import { DEFAULT_NAMESPACE } from "./config";
import { LANGUAGE_CODES, NAMESPACES } from "./catalogues.generated";

/**
 * Values every string may use without being passed them. `{{appName}}` is supplied HERE and nowhere else (it is not in a
 * JSON file, not in a generated key list, not added to the resources): every i18next instance, the server's, the
 * browser's and the audience translator's, takes it from this one object.
 */
export const DEFAULT_VARIABLES: Readonly<Record<string, string>> = { appName: identity.name };

/**
 * i18next options shared by the server and the browser, WITHOUT resources, so the browser bundle can import them without
 * pulling in every language. The server adds `resources` (`options.ts`); the browser takes the language and namespaces it
 * was sent (`i18n.client.ts`). Both read the same values here, so they can never drift into rendering different text for
 * the same language (which React would report as a hydration mismatch).
 *
 * There is NO fallback language: the shipped catalogues are complete for every language (a test holds them to it), so a
 * second language never has to be loaded "just in case".
 */
export const baseI18nOptions = {
  supportedLngs: [...LANGUAGE_CODES],
  fallbackLng: false,
  defaultNS: DEFAULT_NAMESPACE,
  ns: [...NAMESPACES],
  // React already escapes interpolated values; letting i18next escape them too
  // double-encodes apostrophes and accents — visible in Spanish immediately.
  interpolation: { escapeValue: false, defaultVariables: { ...DEFAULT_VARIABLES } },
  returnNull: false,
} satisfies InitOptions;
