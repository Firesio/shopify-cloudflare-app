import { encodeBase64Url } from "~/lib/base64url";

/**
 * HMAC-SHA256 signing for links we put in front of people. Pure by signature: the secret is an argument, never an
 * ambient read (@rules/core.md).
 */

/** The base64url (no padding) HMAC-SHA256 of `payload` under `secret`. */
export async function hmacBase64Url(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return encodeBase64Url(new Uint8Array(signature));
}

/**
 * Constant-time comparison. A string compare returns on the first wrong byte, which leaks how much of a guessed
 * signature was right. A length check first is safe: lengths are public.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  // `?? 0` rather than a non-null assertion: the index is in range by the loop bound, and the code rules have no
  // exception for "obviously safe".
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Whether two signature strings are equal, in constant time. */
export function signaturesMatch(expected: string, presented: string): boolean {
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(expected), encoder.encode(presented));
}
