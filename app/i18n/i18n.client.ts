import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { baseI18nOptions } from "./base-options";
import { loadBrowserResources } from "./client-loaders";
import { BROWSER_NAMESPACES, negotiateLocale } from "./config";

/**
 * Initialise i18next in the browser with the locale the server already used.
 *
 * The locale is read from `<html lang>` rather than re-detected: the server has
 * already resolved it (including Shopify's `locale` parameter), and detecting
 * again client-side could disagree and cause a hydration mismatch. Only that
 * language (and the default, as the fallback) is downloaded.
 */
export async function initClientI18n(): Promise<typeof i18next> {
  if (i18next.isInitialized) return i18next;

  const lng = negotiateLocale(document.documentElement.lang);
  const resources = await loadBrowserResources(lng);

  await i18next.use(initReactI18next).init({
    ...baseI18nOptions,
    lng,
    ns: [...BROWSER_NAMESPACES],
    resources,
  });

  return i18next;
}
