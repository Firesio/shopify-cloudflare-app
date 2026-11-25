import { catalogueFromFiles, createI18n } from "@firesio/app/i18n";

/**
 * The app's words (`@firesio/app/i18n`): ONE catalogue for the pages and the mail, `locales/<language>/<namespace>.json`. The app's languages ARE
 * its folders (English and Spanish here); a key without `ns:` is read from `app.json`, and `firesio.json` of a language would swap a word of the
 * package's own pages by key. `app/firesio.server.ts` hands `I18N` itself to `createFiresio({ i18n: I18N })` (built ONCE: the preset uses the instance as it is);
 * the root loader reads the request's language with the same instance (`localeIn(I18N)`), so the document, the pages and the mail can never disagree.
 * What `createI18n` takes (`layers` of the merchants' edits, `choose: takeChoices` for ICU plural/select) is set HERE, never on `createFiresio`: the template needs neither.
 * `words.ts` declares the namespaces (audience and places) and `words.test.ts` holds that declaration to the catalogue.
 *
 * A new language is a folder with the same keys (`assertCatalogueComplete` in `catalogue.test.ts` fails until every key, placeholder and plural
 * form is there). Placeholders are `{{x}}`; a count picks its plural form (`key_one`, `key_other`).
 */
export const CATALOGUE = catalogueFromFiles(import.meta.glob("./locales/*/*.json", { eager: true }));

/** The language every text is complete in, and where a missing text is looked up next. */
export const FALLBACK_LANGUAGE = "en";

/** The catalogue as a negotiator (`localeIn(I18N)` picks the request's language among the folders): immutable, safe at module scope. */
export const I18N = createI18n({ catalogue: CATALOGUE, fallback: FALLBACK_LANGUAGE });
