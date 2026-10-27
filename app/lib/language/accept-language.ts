// The `Accept-Language` header as evidence: tags ordered by their `q` weight, not by position, because a browser may send
// `en;q=0.5, es;q=0.9` and mean Spanish. Pure.
import { parseLanguageTag, type LanguageTag } from "./tag";

/** A hostile header cannot make us parse thousands of entries. RFC 9110 leaves the length open; real browsers send fewer than 20. */
const MAX_ENTRIES = 32;
const MAX_HEADER_LENGTH = 1024;

/** The `q` weight of one entry's parameters (`q=0.8`), 1 when absent, null when it is not a valid weight (RFC 9110: 0 to 1). */
function weightOf(parameters: readonly string[]): number | null {
  const parameter = parameters.find((candidate) => /^\s*q\s*=/i.test(candidate));
  if (parameter === undefined) return 1;
  const weight = /^\s*q\s*=\s*(\d(?:\.\d{0,3})?)\s*$/i.exec(parameter)?.[1];
  const parsed = weight === undefined ? Number.NaN : Number(weight);
  return parsed >= 0 && parsed <= 1 ? parsed : null;
}

/**
 * The tags a header names, best first (ties keep the header's order), without duplicates. `*`, a weight of 0 ("not
 * acceptable"), an invalid weight and anything that is not a tag are dropped.
 */
export function parseAcceptLanguage(header: string | null): readonly LanguageTag[] {
  if (header === null) return [];
  const entries = header
    .slice(0, MAX_HEADER_LENGTH)
    .split(",")
    .slice(0, MAX_ENTRIES)
    .flatMap((entry, position) => {
      const [range = "", ...parameters] = entry.split(";");
      const tag = parseLanguageTag(range);
      const weight = weightOf(parameters);
      return tag === null || weight === null || weight === 0 ? [] : [{ tag, weight, position }];
    });
  const ordered = [...entries].sort((a, b) => b.weight - a.weight || a.position - b.position).map((entry) => entry.tag);
  return [...new Set(ordered)];
}
