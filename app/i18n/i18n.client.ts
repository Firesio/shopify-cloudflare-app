import { createInstance, type BackendModule, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { baseI18nOptions } from "./base-options";
import { BOOTSTRAP_GLOBAL, parseBootstrap } from "./bootstrap";
import { BROWSER_LOADERS } from "./browser-loaders.generated";
import { BROWSER_NAMESPACES, DEFAULT_LANGUAGE } from "./catalogues.generated";
import { jsonOf } from "./catalogue-modules";
import { browserNamespaceOf, languageCodeOf } from "./config";

/**
 * The browser's only way to load a namespace the server did not send: a navigation to a route that declares another one,
 * or a page that came without its bootstrap. One lazy chunk per language and BROWSER namespace (generated, so a server
 * namespace such as mail is not even listed). A failed request asks i18next to retry (`callback(error, true)`).
 */
const browserBackend: BackendModule = {
  type: "backend",
  init: () => undefined,
  read(language, namespace, callback) {
    const code = languageCodeOf(language);
    const name = browserNamespaceOf(namespace);
    if (code === null || name === null) {
      callback(new Error(`no browser namespace "${namespace}" for language "${language}"`), false);
      return;
    }
    BROWSER_LOADERS[code][name]().then(
      (module) => callback(null, jsonOf(module)),
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), true),
    );
  },
};

/**
 * Create the browser's i18next instance (one per page load, like the server's one per request) with the language and text
 * the server already used, which it put in the page (`bootstrap.ts`): nothing is downloaded to hydrate, and no language is
 * detected again (which could disagree with the server and cause a hydration mismatch). Without a usable bootstrap it
 * falls back to `<html lang>` and loads the browser namespaces of that language only, retrying a failed chunk.
 */
export async function initClientI18n(): Promise<i18n> {
  const bootstrap = parseBootstrap(Reflect.get(window, BOOTSTRAP_GLOBAL));
  const language = bootstrap?.language ?? languageCodeOf(document.documentElement.lang) ?? DEFAULT_LANGUAGE;
  const sent = bootstrap?.resources ?? {};

  const instance = createInstance();
  await instance
    .use(initReactI18next)
    .use(browserBackend)
    .init({
      ...baseI18nOptions,
      lng: language,
      ns: bootstrap === null ? [...BROWSER_NAMESPACES] : Object.keys(sent),
      resources: { [language]: sent },
      partialBundledLanguages: true,
    });

  return instance;
}
