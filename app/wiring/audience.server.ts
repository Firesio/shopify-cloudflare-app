// The composition root for audience text: the ONLY place an `AudienceText` is built. Emails and public pages receive one
// and never look at a request, a cookie or `?locale` themselves.
//
// The defaults ship the catalogues only. An app that later needs more changes `defaultAudienceDeps()` (or builds its own
// deps in a test): a `layersFor` that puts an overrides layer above the shipped one, a `shopLanguages` that reads synced
// shop locales, a `localizer` backed by its own translation table. No renderer changes. See docs/i18n.md.
import { DEFAULT_VARIABLES } from "~/i18n/base-options";
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, NAMESPACES, type LanguageCode } from "~/i18n/catalogues.generated";
import { DEFAULT_NAMESPACE, directionOf } from "~/i18n/config";
import type { AudienceQuery, AudienceText, AudienceTextFor } from "~/i18n/audience";
import { requestEvidence } from "~/i18n/i18n.server";
import { audienceLanguage, type AudienceLanguage } from "~/i18n/roles";
import { shippedLayer } from "~/i18n/shipped-layer.server";
import { TEXT_UNITS, type TextUnit, type UnitKeys } from "~/i18n/text-units";
import { identityContentLocalizer, shippedShopLanguages, type ContentLocalizer, type ShopLanguages } from "~/lib/language/audience";
import { negotiate } from "~/lib/language/negotiate";
import { createTranslator, isUnitComplete, translateKey, type TextLayer, type TextUnits } from "~/lib/language/text";

export interface AudienceDeps {
  readonly shopLanguages: ShopLanguages<LanguageCode>;
  /** Layers for one language, highest priority first. The default is the shipped catalogue alone. */
  readonly layersFor: (language: LanguageCode, shop: string | undefined) => Promise<readonly TextLayer[]>;
  readonly localizer: ContentLocalizer<LanguageCode>;
  readonly units: TextUnits;
}

export function defaultAudienceDeps(): AudienceDeps {
  return {
    shopLanguages: shippedShopLanguages(LANGUAGE_CODES),
    layersFor: (language) => Promise.resolve([shippedLayer(language)]),
    localizer: identityContentLocalizer(),
    units: TEXT_UNITS,
  };
}

interface Chosen {
  readonly language: LanguageCode;
  readonly layers: readonly TextLayer[];
}

/**
 * The language, chosen ONCE per render together with the layers that serve it. A fixed language is the caller's; else the
 * negotiator picks from the evidence among the languages the shop offers, and the shop's primary language (else the
 * default) is the fallback. A language that does not hold the WHOLE unit is not used: the reader gets the default language
 * instead of a mix.
 */
async function chooseLanguage<U extends TextUnit>(deps: AudienceDeps, query: AudienceQuery<U>): Promise<Chosen> {
  const facts = await deps.shopLanguages.forShop(query.shop);
  const available = facts.available.includes(DEFAULT_LANGUAGE) ? facts.available : [DEFAULT_LANGUAGE, ...facts.available];
  const wanted = "fixed" in query ? query.fixed : negotiate(query.evidence, available, facts.primary ?? DEFAULT_LANGUAGE);
  const layers = await deps.layersFor(wanted, query.shop);
  if (wanted !== DEFAULT_LANGUAGE && isUnitComplete(deps.units, query.unit, layers, wanted)) return { language: wanted, layers };
  const defaults = wanted === DEFAULT_LANGUAGE ? layers : await deps.layersFor(DEFAULT_LANGUAGE, query.shop);
  if (!isUnitComplete(deps.units, query.unit, defaults, DEFAULT_LANGUAGE)) {
    throw new Error(`the text unit "${query.unit}" is incomplete in the default language "${DEFAULT_LANGUAGE}"`);
  }
  return { language: DEFAULT_LANGUAGE, layers: defaults };
}

export function createAudienceTextFor(deps: AudienceDeps): AudienceTextFor {
  return async <U extends TextUnit>(query: AudienceQuery<U>): Promise<AudienceText<UnitKeys<U>>> => {
    const { language, layers } = await chooseLanguage(deps, query);
    // React Email escapes what it renders, so i18next must not escape interpolated values too (it would show O&#39;Brien).
    const instance = createTranslator(language, layers, deps.units[query.unit] ?? [], {
      namespaces: NAMESPACES,
      defaultNamespace: DEFAULT_NAMESPACE,
      defaultVariables: DEFAULT_VARIABLES,
      escapeValue: false,
    });
    const reader: AudienceLanguage = audienceLanguage(language);
    return {
      language: reader,
      direction: directionOf(language),
      t: (key, values, count) => translateKey(instance, language, DEFAULT_NAMESPACE, key, values, count),
      fixedT: (namespace) => (key, values, count) => translateKey(instance, language, namespace, key, values, count),
      content: (ref) => deps.localizer.localize(ref, language),
    };
  };
}

/** The app's audience text builder. Immutable configuration only, so a module-level constant is safe in a reused isolate. */
export const audienceTextFor: AudienceTextFor = createAudienceTextFor(defaultAudienceDeps());

/**
 * For a public page: the reader is whoever sent this request, so the evidence is what the request says about THEM
 * (`?lng`, the cookie, `Accept-Language`). Never Shopify's `?locale=`, which is the language of the admin user.
 */
export async function audienceTextForRequest<U extends TextUnit>(request: Request, unit: U): Promise<AudienceText<UnitKeys<U>>> {
  return audienceTextFor({ unit, evidence: await requestEvidence(request) });
}
