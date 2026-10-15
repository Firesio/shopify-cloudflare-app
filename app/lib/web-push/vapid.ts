/**
 * VAPID (RFC 8292): the application server's self-identification to a push service. A short-lived ES256 JWT is sent
 * in `Authorization: vapid t=<jwt>, k=<public key>`. Pure: the clock is a parameter.
 */

import { decodeBase64Url, encodeBase64Url } from "~/lib/base64url";
import { err, ok, type Result } from "~/lib/result";
import {
  exportP256PrivateScalar,
  generateP256KeyPair,
  importP256PrivateKey,
  isUncompressedP256Point,
  P256_PRIVATE_KEY_BYTES,
} from "~/lib/web-push/keys";

const textEncoder = new TextEncoder();

/** RFC 8292 section 2: `exp` must not be more than 24 hours ahead. Half of that leaves room for clock skew. */
export const VAPID_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

/** The two values an operator configures, both base64url: the 65-byte public point and the 32-byte scalar. */
export interface VapidKeys {
  readonly publicKey: string;
  readonly privateKey: string;
}

/** A VAPID key imported for signing. */
export interface VapidSigningKey {
  /** base64url of the uncompressed public key: the `k` parameter. */
  readonly publicKey: string;
  readonly privateKey: CryptoKey;
}

export type VapidFailure = "invalid_vapid_key" | "invalid_endpoint" | "invalid_subject";

/** A new key pair for a fresh deployment. The operator stores both values; see `scripts/generate-vapid-keys.mjs`. */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await generateP256KeyPair("ECDSA", true);
  return {
    publicKey: encodeBase64Url(pair.publicKey),
    privateKey: encodeBase64Url(await exportP256PrivateScalar(pair.privateKey)),
  };
}

/** The `sub` claim must be a `mailto:` or `https:` contact URI (RFC 8292 section 2.1). */
export function isVapidSubject(subject: string): boolean {
  if (subject.startsWith("mailto:")) return subject.length > "mailto:".length;
  return subject.startsWith("https://") && URL.canParse(subject);
}

/** Import configured keys for signing, or fail with `invalid_vapid_key` when they are malformed. */
export async function importVapidKeys(keys: VapidKeys): Promise<Result<VapidSigningKey, "invalid_vapid_key">> {
  const publicKey = decodeBase64Url(keys.publicKey);
  const privateKey = decodeBase64Url(keys.privateKey);
  if (publicKey === null || privateKey === null) return err("invalid_vapid_key");
  if (!isUncompressedP256Point(publicKey) || privateKey.length !== P256_PRIVATE_KEY_BYTES) return err("invalid_vapid_key");
  try {
    const signing = await importP256PrivateKey(publicKey, privateKey, "ECDSA");
    return ok({ publicKey: encodeBase64Url(publicKey), privateKey: signing });
  } catch (error) {
    if (error instanceof DOMException || error instanceof TypeError) return err("invalid_vapid_key");
    throw error;
  }
}

/** The `aud` claim: the origin of the push resource URL, with no path (RFC 8292 section 2). */
export function vapidAudience(endpoint: string): string | null {
  if (!URL.canParse(endpoint)) return null;
  const url = new URL(endpoint);
  return url.protocol === "https:" ? url.origin : null;
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(textEncoder.encode(JSON.stringify(value)));
}

export interface VapidAuthorizationInput {
  readonly key: VapidSigningKey;
  /** The subscription's push resource URL. */
  readonly endpoint: string;
  /** A `mailto:` or `https:` contact URI. */
  readonly subject: string;
  /** Epoch seconds; the token expires `VAPID_TOKEN_LIFETIME_SECONDS` after it. */
  readonly nowSeconds: number;
}

/** The value of the `Authorization` header for one request to `endpoint`. */
export async function vapidAuthorization(input: VapidAuthorizationInput): Promise<Result<string, VapidFailure>> {
  const audience = vapidAudience(input.endpoint);
  if (audience === null) return err("invalid_endpoint");
  if (!isVapidSubject(input.subject)) return err("invalid_subject");

  const signingInput = `${encodeJson({ typ: "JWT", alg: "ES256" })}.${encodeJson({
    aud: audience,
    exp: Math.floor(input.nowSeconds) + VAPID_TOKEN_LIFETIME_SECONDS,
    sub: input.subject,
  })}`;
  // WebCrypto's ECDSA output is the fixed-width r || s that JWS (RFC 7518 section 3.4) requires.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    input.key.privateKey,
    textEncoder.encode(signingInput),
  );
  return ok(`vapid t=${signingInput}.${encodeBase64Url(new Uint8Array(signature))}, k=${input.key.publicKey}`);
}
