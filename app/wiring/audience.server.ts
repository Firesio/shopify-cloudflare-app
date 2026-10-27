// The composition root for audience text: the ONLY place an `AudienceText` is built. Emails and public pages receive one
// and never look at a request, a cookie or `?locale` themselves.
//
// The defaults ship the catalogues only. An app that later needs more changes `defaultAudienceDeps()` (or builds its own
// deps in a test): a `layersFor` that puts an overrides layer above the shipped one, a `shopLanguages` that reads synced
// shop locales, a `localizer` backed by its own translation table. No renderer changes. See docs/i18n.md.
import type { AudienceQuery, AudienceText, AudienceTextFor } from "~/i18n/audience";
import { DEFAULT_LOCALE, DEFAULT_NAMESPACE, NAMESPACES, SUPPORTED_LOCALES } from "~/i18n/config";
import { getLocale } from "~/i18n/i18n.server";
import { shippedLayer } from "~/i18n/shipped-layer.server";
import { TEXT_UNITS, type TextUnit } from "~/i18n/text-units";
import { identity } from "~/identity";
import {
  identityContentLocalizer,
  shippedShopLanguages,
  type ContentLocalizer,
  type ShopLanguages,
} from "~/lib/language/audience";
import { audienceLanguageOf, type AudienceLanguage } from "~/lib/language/roles";
import { directionOf } from "~/lib/language/tag";
import { createTranslator, isUnitComplete, translateKey, type TextLayer, type TextUnits } from "~/lib/language/text";

export interface AudienceDeps {
  readonly shopLanguages: ShopLanguages;
  /** Layers for one language, highest priority first. The default is the shipped catalogue alone. */
  readonly layersFor: (language: string, shop: string | undefined) => Promise<readonly TextLayer[]>;
  readonly localizer: ContentLocalizer;
  readonly units: TextUnits;
}

export function defaultAudienceDeps(): AudienceDeps {
  return {
    shopLanguages: shippedShopLanguages(SUPPORTED_LOCALES),
    layersFor: (language) => Promise.resolve([shippedLayer(language)]),
    localizer: identityContentLocalizer,
    units: TEXT_UNITS,
  };
}

const DEFAULT_AUDIENCE: AudienceLanguage = audienceLanguageOf([DEFAULT_LOCALE], [DEFAULT_LOCALE], DEFAULT_LOCALE);

/**
 * The language: the first evidence an available language matches, else the shop's primary, else the default. A language
 * that does not hold the WHOLE unit is not used: the reader gets the default language instead of a mix.
 */
async function chooseLanguage(deps: AudienceDeps, query: AudienceQuery): Promise<AudienceLanguage> {
  const facts = await deps.shopLanguages.forShop(query.shop);
  const available = facts.available.includes(DEFAULT_LOCALE) ? facts.available : [DEFAULT_LOCALE, ...facts.available];
  const evidence = facts.primary === null ? query.evidence : [...query.evidence, facts.primary];
  const language = audienceLanguageOf(evidence, available, DEFAULT_LOCALE);
  if (language === DEFAULT_AUDIENCE) return language;
  const layers = await deps.layersFor(language, query.shop);
  return isUnitComplete(deps.units, query.unit, layers) ? language : DEFAULT_AUDIENCE;
}

export function createAudienceTextFor(deps: AudienceDeps): AudienceTextFor {
  return async (query) => {
    const language = await chooseLanguage(deps, query);
    const layers = await deps.layersFor(language, query.shop);
    if (!isUnitComplete(deps.units, query.unit, layers)) {
      throw new Error(`the text unit "${query.unit}" is incomplete in the default language "${language}"`);
    }
    // React Email escapes what it renders, so i18next must not escape interpolated values too (it would show O&#39;Brien).
    const instance = createTranslator(language, layers, deps.units[query.unit] ?? [], {
      namespaces: NAMESPACES,
      defaultNamespace: DEFAULT_NAMESPACE,
      defaultVariables: { appName: identity.name },
      escapeValue: false,
    });
    const text: AudienceText = {
      language,
      direction: directionOf(language),
      t: (key, values) => translateKey(instance, language, DEFAULT_NAMESPACE, key, values),
      fixedT: (namespace) => (key, values) => translateKey(instance, language, namespace, key, values),
      content: (refs) => deps.localizer.localize(refs, language),
    };
    return text;
  };
}

/** The app's audience text builder. Immutable configuration only, so a module-level constant is safe in a reused isolate. */
export const audienceTextFor: AudienceTextFor = createAudienceTextFor(defaultAudienceDeps());

/** For a public page: the reader is whoever sent this request, so the evidence is what the request says. */
export async function audienceTextForRequest(request: Request, unit: TextUnit): Promise<AudienceText> {
  return audienceTextFor({ unit, evidence: [await getLocale(request)] });
}
