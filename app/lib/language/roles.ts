// Two different people read two different languages, and the types keep them apart.
//
//  - MerchantLanguage: the language the MERCHANT works in. In the embedded admin Shopify decides it (the `locale` request
//    parameter) and the app must match it.
//  - AudienceLanguage: the language an END CUSTOMER (or any recipient who is not the merchant) reads: emails, public
//    pages, anything the merchant's customers see. It is chosen from evidence about that reader, never from `?locale`.
//
// Both are LanguageTags with an extra brand, so a function that takes one cannot be handed the other.
import type { LanguageTag } from "./tag";
import { matchLanguage, negotiate, parseLanguageTag } from "./tag";

declare const merchantBrand: unique symbol;
declare const audienceBrand: unique symbol;

export type MerchantLanguage = LanguageTag & { readonly [merchantBrand]: true };
export type AudienceLanguage = LanguageTag & { readonly [audienceBrand]: true };

// The minting points. The value was already negotiated to one of the app's languages and parsed to a canonical tag, so
// these only attach the role.
function isMerchantLanguage(tag: LanguageTag): tag is MerchantLanguage {
  return tag.length > 0;
}
function isAudienceLanguage(tag: LanguageTag): tag is AudienceLanguage {
  return tag.length > 0;
}

function tagOf(value: string): LanguageTag {
  const tag = parseLanguageTag(value);
  if (tag === null) throw new Error(`"${value}" is not a language tag`);
  return tag;
}

/** The merchant's language: `requested` is Shopify's `locale` parameter. */
export function merchantLanguageOf(
  requested: unknown,
  available: readonly string[],
  fallback: string,
): MerchantLanguage {
  const tag = tagOf(negotiate(requested, available, fallback));
  if (!isMerchantLanguage(tag)) throw new Error("unreachable: a parsed tag is never empty");
  return tag;
}

/** An end customer's language: the first of `evidence` that one of `available` matches, else `fallback`. */
export function audienceLanguageOf(
  evidence: readonly unknown[],
  available: readonly string[],
  fallback: string,
): AudienceLanguage {
  for (const candidate of evidence) {
    const picked = matchLanguage(candidate, available);
    if (picked === null) continue;
    const tag = tagOf(picked);
    if (isAudienceLanguage(tag)) return tag;
  }
  const tag = tagOf(fallback);
  if (!isAudienceLanguage(tag)) throw new Error("unreachable: a parsed tag is never empty");
  return tag;
}
