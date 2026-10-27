// Language tags. Pure: this module imports nothing from the app, so it can be lifted into any other project unchanged.

declare const languageTagBrand: unique symbol;

/** A canonical BCP-47 tag (`es-MX`, `zh-Hant-TW`), produced only by `parseLanguageTag`. */
export type LanguageTag = string & { readonly [languageTagBrand]: true };

/** The one place a string becomes a `LanguageTag`: `parseLanguageTag` has already canonicalised it. */
function isCanonical(value: string): value is LanguageTag {
  return value.length > 0;
}

/**
 * Parse whatever a request, cookie, header, webhook or database row gave us into a canonical tag, or null.
 *
 * `_` is accepted for `-` (`pt_BR`, which some clients send), and canonicalisation is `Intl`'s, so `ES-es` is `es-ES` and
 * the legacy `iw` is `he`. Anything that is not a well-formed tag is null; it is never guessed at.
 */
export function parseLanguageTag(value: unknown): LanguageTag | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replaceAll("_", "-");
  if (cleaned === "") return null;
  try {
    const canonical = Intl.getCanonicalLocales(cleaned)[0];
    return canonical !== undefined && isCanonical(canonical) ? canonical : null;
  } catch {
    // Intl throws RangeError for a malformed tag; "not a tag" is the answer, not a failure to report.
    return null;
  }
}

/**
 * The tags to try for one tag, most specific first: `zh-Hant-TW` -> `zh-Hant-TW`, `zh-Hant`, `zh`; `es-MX` -> `es-MX`,
 * `es`. Extensions (`-u-ca-...`) and variants are dropped: they never decide which language a person reads.
 */
export function lookupChain(tag: LanguageTag): readonly LanguageTag[] {
  const { language, script, region } = new Intl.Locale(tag);
  if (language === "und") return [];
  const specific = [
    [language, script, region],
    [language, script],
    [language, region],
    [language],
  ];
  const chain: LanguageTag[] = [];
  for (const parts of specific) {
    const candidate = parseLanguageTag(parts.filter((part) => part !== undefined).join("-"));
    if (candidate !== null && !chain.includes(candidate)) chain.push(candidate);
  }
  return chain;
}

/**
 * Pick one of `available` for an untrusted request: the most specific entry of the lookup chain that is available, else
 * `fallback`. Behaviour for a language the app ships: `es-ES`, `es_MX` and `ES-es` all give `es`; `de-DE` gives the fallback.
 */
export function negotiate<T extends string>(
  requested: unknown,
  available: readonly T[],
  fallback: T,
): T {
  return matchLanguage(requested, available) ?? fallback;
}

/** Like `negotiate`, but null when nothing matches, so a caller can try the next piece of evidence. */
export function matchLanguage<T extends string>(requested: unknown, available: readonly T[]): T | null {
  const tag = parseLanguageTag(requested);
  if (tag === null) return null;
  for (const candidate of lookupChain(tag)) {
    const wanted: string = candidate;
    const match = available.find((code) => code === wanted);
    if (match !== undefined) return match;
  }
  return null;
}

const RIGHT_TO_LEFT_SCRIPTS: ReadonlySet<string> = new Set(["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Rohg"]);

/** Reading direction of a language, from its script (maximised, so `ar` and `he` are right-to-left without a table of codes). */
export function directionOf(tag: LanguageTag): "ltr" | "rtl" {
  const script = new Intl.Locale(tag).maximize().script;
  return script !== undefined && RIGHT_TO_LEFT_SCRIPTS.has(script) ? "rtl" : "ltr";
}
