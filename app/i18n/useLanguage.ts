import { useTranslation } from "react-i18next";
import { DEFAULT_LANGUAGE, type LanguageCode } from "./catalogues.generated";
import { languageCodeOf } from "./config";

/**
 * The language the current render is using.
 *
 * Read from i18next rather than from the root loader: i18next is what is
 * actually producing the strings on screen, so a date formatted with this can
 * never disagree with the text beside it. It also keeps components free of a
 * dependency on a specific route id, which made them impossible to render in
 * isolation. The server chose the language and the browser was told it, so this is an exact match,
 * never a negotiation.
 */
export function useLanguage(): LanguageCode {
  const { i18n } = useTranslation();
  return languageCodeOf(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LANGUAGE;
}
