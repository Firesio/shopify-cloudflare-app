// The composition root for text: the ONLY place an `AudienceText` is built. Emails and public pages receive one and never
// look at a request, a cookie or `?locale` themselves.
//
// Two builders, one per kind of reader (see `~/i18n/audience`): the CUSTOMER builder knows the shop's customer languages
// and customer-facing layers; the MERCHANT builder speaks the merchant's language from the shipped catalogue alone.
//
// The defaults ship the catalogues only. An app that later needs more changes `defaultAudienceDeps()` (or builds its own
// deps in a test): a `layersFor` that puts an overrides layer above the shipped one, a `shopLanguages` that reads synced
// shop locales, a `localizer` backed by its own translation table. No renderer changes. See docs/i18n.md.
import { DEFAULT_VARIABLES } from "~/i18n/base-options";
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, NAMESPACES, type LanguageCode } from "~/i18n/catalogues.generated";
import { DEFAULT_NAMESPACE, directionOf } from "~/i18n/config";
import type { AudienceQuery, AudienceText, AudienceTextFor, MerchantQuery, MerchantTextFor, TextBuilders } from "~/i18n/audience";
import { requestEvidence } from "~/i18n/i18n.server";
import type { AudienceLanguage, MerchantLanguage } from "~/i18n/roles";
import { shippedLayer } from "~/i18n/shipped-layer.server";
import { TEXT_UNITS, type TextUnit, type UnitKeys } from "~/i18n/text-units";
import { identityContentLocalizer, shippedShopLanguages, type ContentLocalizer, type ShopLanguages } from "~/lib/language/audience";
import { negotiate } from "~/lib/language/negotiate";
import { createTranslator, isUnitComplete, translateKey, type TextLayer, type TextUnits } from "~/lib/language/text";

type LayersFor = (language: LanguageCode, shop: string | undefined) => Promise<readonly TextLayer[]>;

export interface AudienceDeps {
  readonly shopLanguages: ShopLanguages<LanguageCode>;
  /** Layers for one language, highest priority first. The default is the shipped catalogue alone. */
  readonly layersFor: LayersFor;
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
 * The language that holds the WHOLE unit, with its layers: `wanted` if it is complete, else the default language (a reader
 * never gets a mix). The default language must be complete, or the wiring is broken and this throws.
 */
async function completeIn(units: TextUnits, unit: TextUnit, wanted: LanguageCode, layersFor: LayersFor, shop: string | undefined): Promise<Chosen> {
  const layers = await layersFor(wanted, shop);
  if (wanted !== DEFAULT_LANGUAGE && isUnitComplete(units, unit, layers, wanted)) return { language: wanted, layers };
  const defaults = wanted === DEFAULT_LANGUAGE ? layers : await layersFor(DEFAULT_LANGUAGE, shop);
  if (!isUnitComplete(units, unit, defaults, DEFAULT_LANGUAGE)) {
    throw new Error(`the text unit "${unit}" is incomplete in the default language "${DEFAULT_LANGUAGE}"`);
  }
  return { language: DEFAULT_LANGUAGE, layers: defaults };
}

/** The language of a customer or visitor: fixed by the caller, else the negotiator over the evidence among the shop's languages. */
async function chooseAudience<U extends TextUnit>(deps: AudienceDeps, query: AudienceQuery<U>): Promise<Chosen> {
  const facts = await deps.shopLanguages.forShop(query.shop);
  const available = facts.available.includes(DEFAULT_LANGUAGE) ? facts.available : [DEFAULT_LANGUAGE, ...facts.available];
  const wanted = "fixed" in query ? query.fixed.code : negotiate(query.evidence, available, facts.primary ?? DEFAULT_LANGUAGE);
  return completeIn(deps.units, query.unit, wanted, deps.layersFor, query.shop);
}

/** The translator of one unit in one language. React Email escapes what it renders, so i18next must not escape values too. */
function textOf<U extends TextUnit>(
  units: TextUnits,
  unit: U,
  chosen: Chosen,
  reader: AudienceLanguage | MerchantLanguage,
  content: (ref: Parameters<AudienceText["content"]>[0]) => Promise<string>,
): AudienceText<UnitKeys<U>> {
  const { language, layers } = chosen;
  const instance = createTranslator(language, layers, units[unit] ?? [], {
    namespaces: NAMESPACES,
    defaultNamespace: DEFAULT_NAMESPACE,
    defaultVariables: DEFAULT_VARIABLES,
    escapeValue: false,
  });
  return {
    language: reader,
    direction: directionOf(language),
    fixedT: (namespace) => (key: string, second?: unknown, third?: unknown) =>
      typeof second === "number"
        ? translateKey(instance, language, namespace, key, isValues(third) ? third : {}, second)
        : translateKey(instance, language, namespace, key, isValues(second) ? second : {}),
    content,
  };
}

function isValues(value: unknown): value is Readonly<Record<string, string | number>> {
  return typeof value === "object" && value !== null;
}

export function createAudienceTextFor(deps: AudienceDeps): AudienceTextFor {
  return async <U extends TextUnit>(query: AudienceQuery<U>): Promise<AudienceText<UnitKeys<U>>> => {
    const chosen = await chooseAudience(deps, query);
    const reader: AudienceLanguage = { role: "audience", code: chosen.language };
    return textOf(deps.units, query.unit, chosen, reader, (ref) => deps.localizer.localize(ref, chosen.language));
  };
}

/** What the merchant's own text needs: the units and the layers of a language, which take NO shop (the merchant's own text has no per-shop customer seam). */
export interface MerchantDeps {
  readonly units: TextUnits;
  readonly layersFor: (language: LanguageCode) => Promise<readonly TextLayer[]>;
}

export function defaultMerchantDeps(): MerchantDeps {
  return { units: TEXT_UNITS, layersFor: (language) => Promise.resolve([shippedLayer(language)]) };
}

export function createMerchantTextFor(deps: MerchantDeps): MerchantTextFor {
  return async <U extends TextUnit>(query: MerchantQuery<U>): Promise<AudienceText<UnitKeys<U>>> => {
    // No shop, no customer layers, no customer-language set: the merchant reads the shipped catalogue in their language.
    const chosen = await completeIn(deps.units, query.unit, query.language.code, (language) => deps.layersFor(language), undefined);
    return textOf(deps.units, query.unit, chosen, query.language, (ref) => Promise.resolve(ref.original));
  };
}

/** The app's builders. Immutable configuration only, so module-level constants are safe in a reused isolate. */
export const audienceTextFor: AudienceTextFor = createAudienceTextFor(defaultAudienceDeps());
export const merchantTextFor: MerchantTextFor = createMerchantTextFor(defaultMerchantDeps());
export const textBuilders: TextBuilders = { audienceTextFor, merchantTextFor };

/**
 * For a public page: the reader is whoever sent this request, so the evidence is what the request says about THEM
 * (`?lng`, the cookie, `Accept-Language`). Never Shopify's `?locale=`, which is the language of the admin user.
 */
export async function audienceTextForRequest<U extends TextUnit>(request: Request, unit: U): Promise<AudienceText<UnitKeys<U>>> {
  return audienceTextFor({ unit, evidence: await requestEvidence(request) });
}
