// The ONE validator for text a merchant (or an AI draft, or an import) may put into a string the app renders for others.
// Such a string is DATA: plain text plus `{{allowedName}}` placeholders and nothing else. i18next would otherwise act on
// `{{- x}}` (unescaped), `$t(key)` (nesting, which can pull in any other string) and `{{x, format}}`.
// Extension point: the template stores no merchant text, so only tests call it; an app's save path, AI draft and import
// all go through it. Whether a text is outdated is NOT decided here: an app compares the `source_text` it stored with the current source.

export type TextRejection =
  | "empty"
  | "too_long"
  | "control_character"
  | "nesting"
  | "unescaped_placeholder"
  | "formatted_placeholder"
  | "malformed_placeholder"
  | "reserved_placeholder"
  | "unknown_placeholder"
  | "new_url";

export type TextVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: TextRejection; readonly detail?: string };

export interface TextSpec {
  /** Placeholder names the string may use, e.g. `["name", "ticketNumber"]`. */
  readonly allowed: readonly string[];
  /** Maximum length in characters (code points). */
  readonly maxLength: number;
  /** Allow line breaks and tabs (a body, not a subject line). */
  readonly multiline?: boolean;
  /** The string is a plural form, so `{{count}}` is the number it is about. Otherwise `count` is refused like the other option names. */
  readonly plural?: boolean;
  /** The text this one was written against: URLs present there may stay, any other URL is refused. */
  readonly sourceText?: string;
}

/** i18next's own option names. A placeholder named like one invites a collision with how the lookup works, so none is allowed. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "count", "context", "defaultValue", "ordinal", "replace", "lng", "lngs", "fallbackLng", "ns", "keySeparator", "nsSeparator",
  "returnObjects", "returnDetails", "joinArrays", "postProcess", "interpolation", "skipInterpolation", "nest",
]);

const ALLOWED_FORMAT_CHARACTERS: ReadonlySet<string> = new Set(["‌", "‍"]); // ZWNJ and ZWJ: needed by Persian, Hindi, emoji
const CONTROL = /^[\p{Cc}\p{Cs}]$/u;
const FORMAT = /^\p{Cf}$/u;
const SEPARATOR = /^[\p{Zl}\p{Zp}]$/u;
const LINE_BREAKS = new Set(["\t", "\n", "\r"]);

/**
 * Characters that must never reach a reader as text: controls (C0, C1, DEL), lone surrogates, format characters other than
 * the joiners (zero-width space, bidi overrides, the BOM, which can hide or reorder what a reader sees), and the Unicode
 * line and paragraph separators. Tab, line feed and carriage return are line structure, allowed only when `multiline`.
 */
function hasForbiddenCharacter(text: string, multiline: boolean): boolean {
  return [...text].some((char) => {
    if (LINE_BREAKS.has(char)) return !multiline;
    if (CONTROL.test(char) || SEPARATOR.test(char)) return true;
    return FORMAT.test(char) && !ALLOWED_FORMAT_CHARACTERS.has(char);
  });
}

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;
const NAME = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/;

/**
 * Anything that reads as a link, found TOKEN BY TOKEN so the scan is linear in the length of the text (one regex over the
 * whole text backtracked quadratically): `https://...`, `www....`, a BARE domain (`evil.com/pay`: no scheme, but a mail
 * client or a phone makes it tappable) and a bare IPv4 address. A bare domain is labels, a dot and a 2+ letter top-level
 * label, so `3.5`, `e.g.` and `v1.2` are not links; `Done.Thanks` (no space after the full stop) is, which is the price
 * of not missing `evil.com`. Fullwidth and ideographic dots count as dots, and the joiners ZWJ/ZWNJ, which are allowed in
 * text, are ignored inside a token so they cannot hide a domain.
 */
const TOKEN_SEPARATORS = /[\s,;()<>"“”«»[\]{}]+/u;
const DOT_LOOKALIKES = /[。．｡]/gu;
const JOINERS = /[\u200C\u200D]/g;
const SCHEME_LINK = /^(?:https?:\/\/|www\.)\S+$/iu;
const BARE_DOMAIN = /^(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}(?::\d+)?(?:[/?#]\S*)?$/u;
const BARE_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#]\S*)?$/;
const TRAILING_PUNCTUATION = /[.:!?'’]+$/u;
const LEADING_PUNCTUATION = /^['‘]+/u;

/**
 * The address a link points at, so two spellings of one address compare equal: lower case, no scheme, no `www.`, no
 * punctuation the sentence put around it (`https://shop.com.` is `shop.com`) and no trailing slash.
 */
function normaliseLink(link: string): string {
  return link
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function linksOf(text: string): readonly string[] {
  return text
    .replace(PLACEHOLDER, " ")
    .replace(DOT_LOOKALIKES, ".")
    .replace(JOINERS, "")
    .split(TOKEN_SEPARATORS)
    .map((token) => token.replace(LEADING_PUNCTUATION, "").replace(TRAILING_PUNCTUATION, ""))
    .filter((token) => SCHEME_LINK.test(token) || BARE_DOMAIN.test(token) || BARE_IPV4.test(token))
    .map(normaliseLink)
    .filter((link) => link.includes("."));
}

function placeholderProblem(text: string, spec: TextSpec): TextVerdict | null {
  for (const match of text.matchAll(PLACEHOLDER)) {
    const inner = match[1] ?? "";
    if (inner.trimStart().startsWith("-")) return { ok: false, reason: "unescaped_placeholder", detail: match[0] };
    if (inner.includes(",")) return { ok: false, reason: "formatted_placeholder", detail: match[0] };
    const name = NAME.exec(inner)?.[1];
    if (name === undefined) return { ok: false, reason: "malformed_placeholder", detail: match[0] };
    if (RESERVED_NAMES.has(name) && !(name === "count" && spec.plural === true)) return { ok: false, reason: "reserved_placeholder", detail: name };
    if (!spec.allowed.includes(name)) return { ok: false, reason: "unknown_placeholder", detail: name };
  }
  // `{{{x}}}` is i18next's triple-brace spelling of an unescaped value, whatever is inside it.
  if (text.includes("{{{") || text.includes("}}}")) return { ok: false, reason: "malformed_placeholder" };
  // Whatever `{{` or `}}` is left after removing the well-formed ones is a broken placeholder.
  if (/\{\{|\}\}/.test(text.replace(PLACEHOLDER, ""))) return { ok: false, reason: "malformed_placeholder" };
  return null;
}

/** Validate one merchant-editable string. Pure. */
export function validateText(text: string, spec: TextSpec): TextVerdict {
  if (text.trim() === "") return { ok: false, reason: "empty" };
  if ([...text].length > spec.maxLength) return { ok: false, reason: "too_long" };
  if (hasForbiddenCharacter(text, spec.multiline === true)) return { ok: false, reason: "control_character" };
  if (text.includes("$t(")) return { ok: false, reason: "nesting" };
  const placeholder = placeholderProblem(text, spec);
  if (placeholder !== null) return placeholder;
  const known = new Set(linksOf(spec.sourceText ?? ""));
  const added = linksOf(text).find((link) => !known.has(link));
  if (added !== undefined) return { ok: false, reason: "new_url", detail: added };
  return { ok: true };
}
