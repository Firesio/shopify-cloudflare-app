// The browser's catalogue loaders: one chunk per language and namespace, requested only when that language is needed.
// A visitor reading Spanish downloads the Spanish files (and the default language's, as the fallback), not every language.
import { buildLoaders, loadBundles, type ResourceMap } from "./catalogue-modules";
import { BROWSER_NAMESPACES, DEFAULT_LOCALE } from "./config";
import { withIdentity } from "./identity-values";

const loaders = buildLoaders(import.meta.glob("./locales/*/*.json"));

export async function loadBrowserResources(language: string): Promise<ResourceMap> {
  const codes = language === DEFAULT_LOCALE ? [language] : [language, DEFAULT_LOCALE];
  return withIdentity(await loadBundles(loaders, codes, BROWSER_NAMESPACES));
}
