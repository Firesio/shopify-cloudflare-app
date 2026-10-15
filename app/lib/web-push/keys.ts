/**
 * P-256 key handling shared by message encryption (ECDH, RFC 8291) and VAPID (ECDSA, RFC 8292). WebCrypto only.
 *
 * Keys travel as the raw forms the Web Push specs use: a public key is the 65-byte uncompressed point
 * (0x04 || X || Y), a private key is the 32-byte scalar `d`.
 */

import { decodeBase64Url, encodeBase64Url } from "~/lib/base64url";

export const P256_PUBLIC_KEY_BYTES = 65;
export const P256_PRIVATE_KEY_BYTES = 32;
const COORDINATE_BYTES = 32;
const UNCOMPRESSED_POINT_PREFIX = 0x04;

export type P256Algorithm = "ECDH" | "ECDSA";

/** A key pair in the shape the Web Push specs use: raw public bytes beside a private `CryptoKey`. */
export interface P256KeyPair {
  readonly publicKey: Uint8Array<ArrayBuffer>;
  readonly privateKey: CryptoKey;
}

/** Shape only (65 bytes, uncompressed prefix); that the point is on the curve is checked when the key is imported. */
export function isUncompressedP256Point(bytes: Uint8Array): boolean {
  return bytes.length === P256_PUBLIC_KEY_BYTES && bytes[0] === UNCOMPRESSED_POINT_PREFIX;
}

function curve(algorithm: P256Algorithm): EcKeyImportParams {
  return { name: algorithm, namedCurve: "P-256" };
}

/** Import another party's public key. Throws a `DOMException` when the bytes are not a point on P-256. */
export async function importP256PublicKey(publicKey: Uint8Array, algorithm: P256Algorithm): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array(publicKey), curve(algorithm), false, []);
}

/**
 * Import our own private scalar. WebCrypto has no raw import for private keys, so it goes through JWK, which also
 * wants the public coordinates. Throws when the bytes are malformed.
 */
export async function importP256PrivateKey(
  publicKey: Uint8Array,
  privateKey: Uint8Array,
  algorithm: P256Algorithm,
): Promise<CryptoKey> {
  if (!isUncompressedP256Point(publicKey) || privateKey.length !== P256_PRIVATE_KEY_BYTES) {
    throw new TypeError("not a P-256 key pair");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: encodeBase64Url(publicKey.slice(1, 1 + COORDINATE_BYTES)),
    y: encodeBase64Url(publicKey.slice(1 + COORDINATE_BYTES)),
    d: encodeBase64Url(privateKey),
  };
  const usages: KeyUsage[] = algorithm === "ECDH" ? ["deriveBits"] : ["sign"];
  return crypto.subtle.importKey("jwk", jwk, curve(algorithm), false, usages);
}

/** A fresh P-256 key pair. Only a pair that must be exported (VAPID key generation) is `extractable`. */
export async function generateP256KeyPair(algorithm: P256Algorithm, extractable: boolean): Promise<P256KeyPair> {
  const usages: KeyUsage[] = algorithm === "ECDH" ? ["deriveBits"] : ["sign", "verify"];
  const pair = await crypto.subtle.generateKey(curve(algorithm), extractable, usages);
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { publicKey: new Uint8Array(raw), privateKey: pair.privateKey };
}

/** The 32-byte scalar of an extractable private key. */
export async function exportP256PrivateScalar(privateKey: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const scalar = jwk.d === undefined ? null : decodeBase64Url(jwk.d);
  if (scalar === null) throw new TypeError("not a private key");
  return scalar;
}
