// Language tags. Pure and client-safe: this module imports nothing from the app and none of the CLDR tables, so a browser
// can hold a `LanguageTag` without shipping the negotiation data (that lives in `negotiate.ts`, server only).
import { z } from "zod";

/** `Intl`'s canonical form of a well-formed tag, or null. `_` is accepted for `-` (`pt_BR`, which some clients send). */
function canonicalise(value: string): string | null {
  const cleaned = value.trim().replaceAll("_", "-");
  if (cleaned === "") return null;
  try {
    return Intl.getCanonicalLocales(cleaned)[0] ?? null;
  } catch {
    // Intl throws RangeError for a malformed tag; "not a tag" is the answer, not a failure to report.
    return null;
  }
}

/**
 * THE edge schema for a language tag: request parameters, cookies, headers, Shopify payloads, stored columns and queue
 * envelopes are all parsed through it, so an inner function never sees `es_mx`, `ES-es` or the legacy `iw`. The brand
 * is minted only here (by the parse), so a raw string cannot be passed where a tag is expected.
 */
export const languageTagSchema = z
  .string()
  .max(64)
  .transform((value, context) => {
    const tag = canonicalise(value);
    if (tag === null) {
      context.addIssue({ code: "custom", message: "not a well-formed language tag" });
      return z.NEVER;
    }
    return tag;
  })
  .brand<"LanguageTag">();

/** A canonical BCP-47 tag (`es-MX`, `zh-Hant-TW`). */
export type LanguageTag = z.infer<typeof languageTagSchema>;

/**
 * Parse whatever a request, cookie, header, webhook or database row gave us into a canonical tag, or null. Canonicalisation
 * is `Intl`'s, so `ES-es` is `es-ES` and the legacy `iw` is `he`. Anything that is not a well-formed tag is null; it is
 * never guessed at.
 */
export function parseLanguageTag(value: unknown): LanguageTag | null {
  const parsed = languageTagSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
