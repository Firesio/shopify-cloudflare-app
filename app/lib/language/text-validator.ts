// The ONE validator for text a merchant (or an AI draft, or an import) may put into a string the app renders for others.
// Such a string is DATA: plain text plus `{{allowedName}}` placeholders and nothing else. i18next would otherwise act on
// `{{- x}}` (unescaped), `$t(key)` (nesting, which can pull in any other string) and `{{x, format}}`.
import type { TextKey } from "./text";

export type TextRejection =
  | "empty"
  | "too_long"
  | "control_character"
  | "nesting"
  | "unescaped_placeholder"
  | "formatted_placeholder"
  | "malformed_placeholder"
  | "unknown_placeholder"
  | "new_url"
  | "outdated";

export type TextVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: TextRejection; readonly detail?: string };

export interface TextSpec {
  /** Placeholder names the string may use, e.g. `["name", "ticketNumber"]`. */
  readonly allowed: readonly string[];
  /** Maximum length in characters (code points). */
  readonly maxLength: number;
  /** Allow line breaks (a body, not a subject line). */
  readonly multiline?: boolean;
  /** The text this one was written against: URLs present there may stay, any other URL is refused. */
  readonly sourceText?: string;
  /** The digest the editor held (`given`) against the current source's (`current`): a mismatch is "outdated". */
  readonly digest?: { readonly given: string; readonly current: string };
}

/** C0 controls (except tab, line feed, carriage return, which `multiline` governs) and DEL. */
function hasControlCharacter(text: string): boolean {
  return [...text].some((char) => {
    const code = char.charCodeAt(0);
    return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
  });
}
const LINE_BREAK = /[\r\n\t]/;
const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;
const NAME = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/;
const URL_LIKE = /(?:https?:\/\/|www\.)[^\s]+/gi;

/** URLs a text carries, lower-cased, so the same address in different case is not "new". */
function urlsOf(text: string): readonly string[] {
  return (text.match(URL_LIKE) ?? []).map((url) => url.toLowerCase());
}

function placeholderProblem(text: string, allowed: readonly string[]): TextVerdict | null {
  for (const match of text.matchAll(PLACEHOLDER)) {
    const inner = match[1] ?? "";
    if (inner.trimStart().startsWith("-")) return { ok: false, reason: "unescaped_placeholder", detail: match[0] };
    if (inner.includes(",")) return { ok: false, reason: "formatted_placeholder", detail: match[0] };
    const name = NAME.exec(inner)?.[1];
    if (name === undefined) return { ok: false, reason: "malformed_placeholder", detail: match[0] };
    if (!allowed.includes(name)) return { ok: false, reason: "unknown_placeholder", detail: name };
  }
  // Whatever `{{` or `}}` is left after removing the well-formed ones is a broken placeholder.
  if (/\{\{|\}\}/.test(text.replace(PLACEHOLDER, ""))) return { ok: false, reason: "malformed_placeholder" };
  return null;
}

/** Validate one merchant-editable string. Pure; the digest (async) is computed by the caller with `sourceDigest`. */
export function validateText(text: string, spec: TextSpec): TextVerdict {
  if (text.trim() === "") return { ok: false, reason: "empty" };
  if ([...text].length > spec.maxLength) return { ok: false, reason: "too_long" };
  if (hasControlCharacter(text) || (spec.multiline !== true && LINE_BREAK.test(text))) return { ok: false, reason: "control_character" };
  if (text.includes("$t(")) return { ok: false, reason: "nesting" };
  const placeholder = placeholderProblem(text, spec.allowed);
  if (placeholder !== null) return placeholder;
  const known = urlsOf(spec.sourceText ?? "");
  const added = urlsOf(text).find((url) => !known.includes(url));
  if (added !== undefined) return { ok: false, reason: "new_url", detail: added };
  if (spec.digest !== undefined && spec.digest.given !== spec.digest.current) return { ok: false, reason: "outdated" };
  return { ok: true };
}

/**
 * SHA-256 of a source string, lower-case hex: what an override stores as the source it was written against. The
 * generated `SOURCE_DIGESTS` map holds the same value for every shipped string, so "outdated" (the digest differs from
 * the current source) is a comparison at render, with no query.
 */
export async function sourceDigest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Keys of a unit whose stored digest no longer matches the current source (an override written against older text). */
export function outdatedKeys(
  keys: readonly TextKey[],
  stored: (key: TextKey) => string | undefined,
  current: (key: TextKey) => string | undefined,
): readonly TextKey[] {
  return keys.filter((key) => {
    const was = stored(key);
    return was !== undefined && was !== current(key);
  });
}
