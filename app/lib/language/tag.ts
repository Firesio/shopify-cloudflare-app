// Language tags. Pure: this module imports nothing from the app, so it can be lifted into any other project unchanged.
import { PARENT_LOCALES } from "./parent-locales.generated";

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

/** The tag with its likely script and region filled in (`zh-TW` -> `zh-Hant-TW`, `pt` -> `pt-Latn-BR`). */
function maximal(tag: string): Intl.Locale {
  return new Intl.Locale(tag).maximize();
}

/** One step up: drop the region, then the script. Null at the bare language. */
function truncate(tag: string): string | null {
  const { language, script, region } = new Intl.Locale(tag);
  if (region !== undefined) return script === undefined ? language : `${language}-${script}`;
  return script === undefined ? null : language;
}

/**
 * The tags to try for one tag, most specific first, SCRIPT-AWARE: `es-MX` -> `es-MX`, `es-419`, `es`; `pt-AO` -> `pt-AO`,
 * `pt-PT`, `pt`; `zh-TW` -> `zh-TW`, `zh-Hant`. A step is the CLDR parent where CLDR names one (`parentLocales`, which
 * also says "stop" for script variants such as `sr-Latn`), else truncation; a tag in another script than the request is
 * never in the chain, so `zh-TW` is never answered with Simplified Chinese. Extensions and variants are dropped.
 */
export function lookupChain(tag: LanguageTag): readonly LanguageTag[] {
  const start = new Intl.Locale(tag);
  if (start.language === "und") return [];
  const wanted = start.maximize();
  const chain: LanguageTag[] = [];
  const add = (value: string): void => {
    const parsed = parseLanguageTag(value);
    if (parsed !== null && !chain.includes(parsed) && maximal(parsed).script === wanted.script) chain.push(parsed);
  };
  let current: string | null = start.baseName;
  const seen = new Set<string>();
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    add(current);
    const parent: string | undefined = PARENT_LOCALES[current] ?? PARENT_LOCALES[maximal(current).baseName];
    if (parent === "und") break;
    current = parent ?? truncate(current);
  }
  // The language in the request's own script (`zh-HK` -> `zh-Hant`), so a catalogue written for that script matches.
  if (wanted.script !== undefined) {
    const scripted = `${wanted.language}-${wanted.script}`;
    if (!chain.some((entry) => maximal(entry).toString() === maximal(scripted).toString())) add(scripted);
  }
  return chain;
}

/**
 * Pick one of `available` for an untrusted request: the first entry of the lookup chain that is available. A candidate
 * matches a chain entry when both resolve to the same language, script and region (`pt` matches `pt-BR`, `zh` matches
 * `zh-CN`, `zh-TW` matches `zh-Hant`), so LANGUAGE and SCRIPT must be equal and the region is preferred exact, then CLDR
 * parent, then the language's own default. Else `fallback`.
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
  const candidates = available.flatMap((code) => {
    const parsed = parseLanguageTag(code);
    return parsed === null ? [] : [{ code, key: maximal(parsed).toString() }];
  });
  for (const step of lookupChain(tag)) {
    const key = maximal(step).toString();
    const match = candidates.find((candidate) => candidate.key === key);
    if (match !== undefined) return match.code;
  }
  return null;
}

const RIGHT_TO_LEFT_SCRIPTS: ReadonlySet<string> = new Set(["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Rohg"]);

/** Reading direction of a language, from its script (maximised, so `ar` and `he` are right-to-left without a table of codes). */
export function directionOf(tag: LanguageTag): "ltr" | "rtl" {
  const script = new Intl.Locale(tag).maximize().script;
  return script !== undefined && RIGHT_TO_LEFT_SCRIPTS.has(script) ? "rtl" : "ltr";
}
