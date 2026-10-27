// THE contract for anything an end customer (or any recipient who is not the merchant) reads: emails, public and customer
// pages. A render depends on an `AudienceText` and on nothing else about languages, so an app that later adds override
// layers, merchant languages or translated content changes how one is BUILT (`app/wiring/audience.server.ts`), never a
// renderer. Admin code (the merchant's own screens) never uses it: it reads `getMerchantLanguage`.
import type { LanguageCode, Namespace } from "./catalogues.generated";
import type { AudienceLanguage } from "./roles";
import type { TextUnit, UnitKey, UnitKeys } from "./text-units";
import type { ContentLocalizer, ContentRef } from "~/lib/language/audience";
import type { LanguageTag } from "~/lib/language/tag";
import type { TextValues } from "~/lib/language/text";

/** Translate one key of one namespace: only keys the unit lists, named values for `{{placeholders}}`, `count` for a plural group. */
export type AudienceT<K extends string> = (key: K, values?: TextValues, count?: number) => string;

type KeysIn<U extends UnitKey, N extends Namespace> = Extract<U, { readonly namespace: N }>["key"];

/**
 * What a render holds. `K` is the keys of the unit it was built for, so `t("not.in.the.unit")` is a compile error. A
 * text built for a unit with more keys can be used where fewer are needed (an email layout takes any email's text).
 */
export interface AudienceText<K extends UnitKey = UnitKey> {
  readonly language: AudienceLanguage;
  readonly direction: "ltr" | "rtl";
  /** Translate in the default namespace (`common`). */
  readonly t: AudienceT<KeysIn<K, "common">>;
  /** Translate in one namespace: `text.fixedT("email")("support.reply.subject")`. */
  fixedT<N extends K["namespace"]>(namespace: N): AudienceT<KeysIn<K, N>>;
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
} & ({ readonly evidence: readonly LanguageTag[] } | { readonly fixed: LanguageCode });

export type AudienceTextFor = <U extends TextUnit>(query: AudienceQuery<U>) => Promise<AudienceText<UnitKeys<U>>>;

export type { ContentLocalizer, ContentRef };
