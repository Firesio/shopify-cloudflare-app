// The "outdated" rule for text an app stores against our source text (an override, a translation): it keeps the digest of
// the source it was written against, and is outdated when the current source's digest differs (Shopify does the same with
// `translatableContentDigest`). Extension point: nothing in the template stores such text, so only tests call these.

/**
 * SHA-256 of a source string, lower-case hex: what an override stores as the source it was written against. The generated
 * `SOURCE_DIGESTS` map (`digests.generated.server.ts`) holds the same value for every shipped string, so "outdated" is a
 * comparison at render, with no query.
 */
export async function sourceDigest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** True when a stored text was written against a different source than the current one. */
export function isOutdated(storedDigest: string, currentDigest: string): boolean {
  return storedDigest !== currentDigest;
}
