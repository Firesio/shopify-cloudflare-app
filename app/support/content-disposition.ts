/**
 * A `Content-Disposition` value for a stored attachment, per RFC 6266 / RFC 8187.
 *
 * Two names are sent: an ASCII `filename` for clients that read only that, and
 * `filename*` carrying the real name as UTF-8 percent-encoding. A browser that
 * understands the second (all current ones) prefers it, so `注文.csv` downloads as
 * `注文.csv` rather than as underscores.
 *
 * Pure: the name is expected to have passed `safeFilename`, and this still never
 * lets a quote, backslash or control character reach the quoted fallback.
 */
export type Disposition = "inline" | "attachment";

/** RFC 8187 `attr-char` leaves these unescaped; `encodeURIComponent` also leaves `!'()*`, which must be escaped. */
function encodeExtendedValue(value: string): string {
  return encodeURIComponent(value).replace(/['()*!]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Printable ASCII only, with the two characters that end a quoted string replaced. */
function asciiFallback(filename: string): string {
  const ascii = Array.from(filename)
    .map((character) => (/[\x20-\x7e]/.test(character) && character !== '"' && character !== "\\" ? character : "_"))
    .join("")
    .trim();
  return ascii === "" || /^_+$/.test(ascii) ? "file" : ascii;
}

export function contentDisposition(disposition: Disposition, filename: string): string {
  return `${disposition}; filename="${asciiFallback(filename)}"; filename*=UTF-8''${encodeExtendedValue(filename)}`;
}

/** Images and video render in the thread; everything else is an explicit download. */
export function dispositionFor(contentType: string): Disposition {
  return contentType.startsWith("image/") || contentType.startsWith("video/") ? "inline" : "attachment";
}
