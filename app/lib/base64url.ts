/**
 * base64url (RFC 4648 section 5) without padding: the alphabet that is safe in a URL path, a header value and a
 * JWT. Pure; no `Buffer`, so it runs in workerd, the browser and Node alike.
 */

const ALPHABET = /^[A-Za-z0-9_-]*$/;

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The bytes behind a base64url string, or `null` when it is not valid base64url. Strict about the alphabet (a `+`,
 * `/` or whitespace is rejected rather than silently accepted) and about length; the browser's own unpadded form
 * is what is expected, and trailing `=` padding is tolerated and ignored.
 */
export function decodeBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  const padded = text.endsWith("=");
  if (padded && text.length % 4 !== 0) return null;
  const unpadded = padded ? text.replace(/={1,2}$/, "") : text;
  if (!ALPHABET.test(unpadded) || unpadded.length % 4 === 1) return null;
  const standard = unpadded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
