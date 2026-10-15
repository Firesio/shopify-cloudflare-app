import { decodeBase64Url } from "~/lib/base64url";
import { P256_PRIVATE_KEY_BYTES, isUncompressedP256Point } from "~/lib/web-push/keys";
import { isVapidSubject } from "~/lib/web-push/vapid";

/** What web push needs to identify this app to a push service. */
export interface VapidConfig {
  /** base64url, 65-byte uncompressed P-256 point: public, also handed to browsers as the application server key. */
  readonly publicKey: string;
  /** base64url, 32-byte scalar: secret. */
  readonly privateKey: string;
  /** A `mailto:` or `https:` contact URI (RFC 8292 section 2.1). */
  readonly subject: string;
}

/**
 * Web push is optional, so "not configured" is a normal answer, not an error: `null` unless the public key, the
 * private key and the subject are all well-formed. The private key arrives as `unknown` because it is a secret that
 * `wrangler.jsonc` deliberately does not declare (a missing required secret would fail the deploy), so `Env` has
 * no type for it. Never throws and never echoes a value.
 *
 * Shape only: that the private key belongs to the public key is not checked here (it needs async WebCrypto).
 */
export function vapidConfig(publicKey: string, privateKey: unknown, subject: string): VapidConfig | null {
  if (typeof privateKey !== "string") return null;
  const publicBytes = decodeBase64Url(publicKey);
  const privateBytes = decodeBase64Url(privateKey);
  if (publicBytes === null || privateBytes === null) return null;
  if (!isUncompressedP256Point(publicBytes) || privateBytes.length !== P256_PRIVATE_KEY_BYTES) return null;
  if (!isVapidSubject(subject)) return null;
  return { publicKey, privateKey, subject };
}
