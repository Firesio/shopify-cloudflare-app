// THE contract for anything a reader other than the merchant's own screens shows: emails, public and customer pages. A
// render depends on an `AudienceText` and on nothing else about languages, so an app that later adds override layers,
// merchant languages or translated content changes how one is BUILT (`app/wiring/audience.server.ts`), never a renderer.
// Admin code (the merchant's own screens) never uses it: it reads `getMerchantLanguage`.
//
// There are TWO builders because there are two kinds of reader, and each takes the language of ITS role:
//  - `AudienceTextFor`: a customer or a visitor. Takes `AudienceLanguage` or evidence; sees the shop's customer languages
//    and customer-facing layers.
//  - `MerchantTextFor`: the merchant, in the language they work in. Takes `MerchantLanguage`; sees only the shipped
//    catalogue, never a shop's customer overrides or customer-language set.
// Handing one the other's language is a type error.
import type { Namespace } from "./catalogues.generated";
import type { AudienceLanguage, MerchantLanguage } from "./roles";
import type { TextUnit, UnitKey, UnitKeys } from "./text-units";
import type { ContentRef } from "~/lib/language/audience";
import type { LanguageTag } from "~/lib/language/tag";
import type { TextValues } from "~/lib/language/text";

/**
 * Translate one key of one namespace: only keys the unit lists. A PLURAL key takes its count as the second argument and a
 * plain key takes none, so a plural without a count, or a count on a plain string, does not compile.
 */
export interface AudienceT<Plain extends string, Plural extends string> {
  (key: Plain, values?: TextValues): string;
  (key: Plural, count: number, values?: TextValues): string;
}

type PlainKeysIn<U extends UnitKey, N extends Namespace> = Extract<U, { readonly namespace: N; readonly plural?: never }>["key"];
type PluralKeysIn<U extends UnitKey, N extends Namespace> = Extract<U, { readonly namespace: N; readonly plural: true }>["key"];

/**
 * What a render holds. `K` is the keys of the unit it was built for, so `fixedT("email")("not.in.the.unit")` is a compile
 * error. A text built for a unit with more keys can be used where fewer are needed (an email layout takes any email's text).
 */
export interface AudienceText<K extends UnitKey = UnitKey> {
  /** Whose language this is: a customer's or the merchant's. */
  readonly language: AudienceLanguage | MerchantLanguage;
  readonly direction: "ltr" | "rtl";
  /** Translate in one namespace: `text.fixedT("email")("support.reply.subject")`. */
  fixedT<N extends K["namespace"]>(namespace: N): AudienceT<PlainKeysIn<K, N>, PluralKeysIn<K, N>>;
  /** The app's own stored text in this reader's language (the original when there is no translation). */
  content(ref: ContentRef): Promise<string>;
}

/**
 * Who is reading. Either the caller knows the language (`fixed`: staff-facing mail is English by this app's choice) or it
 * brings `evidence`: what it knows about the reader, best first, ALREADY PARSED at the edge into `LanguageTag`s.
 */
export type AudienceQuery<U extends TextUnit> = {
  readonly shop?: string;
  /** A `TEXT_UNITS` entry: the reader is only shown a language in which the WHOLE unit exists. */
  readonly unit: U;
} & ({ readonly evidence: readonly LanguageTag[] } | { readonly fixed: AudienceLanguage });

export type AudienceTextFor = <U extends TextUnit>(query: AudienceQuery<U>) => Promise<AudienceText<UnitKeys<U>>>;

export interface MerchantQuery<U extends TextUnit> {
  readonly unit: U;
  readonly language: MerchantLanguage;
}

export type MerchantTextFor = <U extends TextUnit>(query: MerchantQuery<U>) => Promise<AudienceText<UnitKeys<U>>>;

/** Both builders: a notification's email is written by the one that matches who it is for. */
export interface TextBuilders {
  readonly audienceTextFor: AudienceTextFor;
  readonly merchantTextFor: MerchantTextFor;
}

