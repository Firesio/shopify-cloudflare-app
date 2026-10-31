// THE negotiator: which of the languages we have serves a reader, given what we know about them. Pure, SERVER ONLY (it
// carries the CLDR parent table; a browser never negotiates, it is told the language the server chose).
import { PARENT_LOCALES } from "./parent-locales.generated";
import { parseLanguageTag, type LanguageTag } from "./tag";

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
function lookupChain(start: Intl.Locale): readonly string[] {
  const wanted = start.maximize();
  const chain: string[] = [];
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
  if (wanted.script !== undefined) add(`${wanted.language}-${wanted.script}`);
  return chain;
}

interface Candidate<T extends string> {
  readonly code: T;
  readonly language: string;
  readonly script: string | undefined;
  /** Language, script and region, so `pt` and `pt-BR` are the same candidate. */
  readonly key: string;
}

function candidatesOf<T extends string>(available: readonly T[]): readonly Candidate<T>[] {
  return available.flatMap((code) => {
    const parsed = parseLanguageTag(code);
    if (parsed === null) return [];
    const locale = maximal(parsed);
    return [{ code, language: locale.language, script: locale.script, key: locale.toString() }];
  });
}

/**
 * One of `available` for one tag, or null. In order: the exact region, the CLDR parent, the language's own default (all
 * inside the lookup chain), then ANY available region of the same language AND script (`es-ES` with only `es-419`
 * shipped, `fr-FR` with only `fr-CA`), the first in code order so the answer never depends on the order of `available`.
 * Another script is never served (`zh-TW` with only `zh-CN`, `sr-Latn` with only `sr`).
 */
function matchOne<T extends string>(tag: LanguageTag, available: readonly T[]): T | null {
  const start = new Intl.Locale(tag);
  if (start.language === "und") return null;
  const candidates = candidatesOf(available);
  for (const step of lookupChain(start)) {
    const key = maximal(step).toString();
    const match = candidates.find((candidate) => candidate.key === key);
    if (match !== undefined) return match.code;
  }
  const wanted = start.maximize();
  const siblings = candidates.filter((candidate) => candidate.language === wanted.language && candidate.script === wanted.script);
  return [...siblings].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))[0]?.code ?? null;
}

/**
 * Pick one of `available` for a reader. `evidence` is what we know about them, best first and already parsed at the edge
 * (`parseLanguageTag`); the first piece that matches wins, else `fallback`. It always answers: `fallback` is one of the
 * languages the caller can serve.
 */
export function negotiate<T extends string>(evidence: readonly LanguageTag[], available: readonly T[], fallback: T): T {
  for (const tag of evidence) {
    const match = matchOne(tag, available);
    if (match !== null) return match;
  }
  return fallback;
}
