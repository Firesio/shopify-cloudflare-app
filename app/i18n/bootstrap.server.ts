import type { BrowserNamespace, LanguageCode } from "./catalogues.generated";
import { bootstrapScript, type I18nBootstrap } from "./bootstrap";
import { resources } from "./resources";

/** The text the browser needs to hydrate this page: only `namespaces`, only `language`. */
export function bootstrapFor(language: LanguageCode, namespaces: readonly BrowserNamespace[]): I18nBootstrap {
  const own = resources[language] ?? {};
  return {
    language,
    resources: Object.fromEntries(namespaces.flatMap((namespace) => (own[namespace] === undefined ? [] : [[namespace, own[namespace]]]))),
  };
}

/** The inline script that hands it over. */
export function bootstrapScriptFor(language: LanguageCode, namespaces: readonly BrowserNamespace[]): string {
  return bootstrapScript(bootstrapFor(language, namespaces));
}
