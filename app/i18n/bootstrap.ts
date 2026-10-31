// What the server tells the browser about language, so hydration needs no network: the language the page was drawn in
// and the text of exactly the namespaces the matched routes declared (an inline `<script>` before the app's own). A
// failed chunk request can therefore never leave a dead page; a missing or malformed bootstrap makes the browser load
// the namespaces itself, with retries (`i18n.client.ts`).
import type { LanguageCode } from "./catalogues.generated";
import { languageCodeOf } from "./config";

/** The `window` property the inline script sets. */
export const BOOTSTRAP_GLOBAL = "__I18N__";

export interface I18nBootstrap {
  readonly language: LanguageCode;
  /** namespace -> nested catalogue, for `language` only. */
  readonly resources: Readonly<Record<string, object>>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse what the page carried, or null when it is absent or not what the server writes. */
export function parseBootstrap(raw: unknown): I18nBootstrap | null {
  if (!isObject(raw)) return null;
  const language = languageCodeOf(raw.language);
  if (language === null || !isObject(raw.resources)) return null;
  const resources = Object.entries(raw.resources).filter((entry): entry is [string, Record<string, unknown>] => isObject(entry[1]));
  return resources.length === Object.keys(raw.resources).length ? { language, resources: Object.fromEntries(resources) } : null;
}

/** The inline script's text: `window.__I18N__ = {...}`, with `<` escaped so the data can never close the tag. */
export function bootstrapScript(bootstrap: I18nBootstrap): string {
  return `window.${BOOTSTRAP_GLOBAL}=${JSON.stringify(bootstrap).replaceAll("<", "\\u003c")};`;
}
