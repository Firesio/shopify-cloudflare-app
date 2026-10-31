// Two different people read two different languages, and the types keep them apart.
//
//  - MerchantLanguage: the language the MERCHANT works in. In the embedded admin Shopify decides it (the `locale` request
//    parameter) and the app must match it.
//  - AudienceLanguage: the language an END CUSTOMER (or any recipient who is not the merchant) reads: emails, public
//    pages, anything the merchant's customers see. It is chosen from evidence about that reader, never from `?locale`.
//
// Both wrap the ONE language type (`LanguageCode`, the generated union of shipped languages) in a tagged object, so a
// function that takes one cannot be handed the other, and neither is a cast, a guard that always says yes, or a throw.
import type { LanguageCode } from "./catalogues.generated";

export interface MerchantLanguage {
  readonly role: "merchant";
  readonly code: LanguageCode;
}

export interface AudienceLanguage {
  readonly role: "audience";
  readonly code: LanguageCode;
}

export function merchantLanguage(code: LanguageCode): MerchantLanguage {
  return { role: "merchant", code };
}

export function audienceLanguage(code: LanguageCode): AudienceLanguage {
  return { role: "audience", code };
}
