import { decodeBase64Url, encodeBase64Url } from "~/lib/base64url";

/**
 * Authenticated encryption of small secrets at rest (AES-256-GCM).
 *
 * The key is derived with HKDF-SHA256 from a configured secret and a fixed
 * `purpose`, so one configured secret can never decrypt another purpose's data
 * by accident. Sealed form: `v1.<iv>.<ciphertext+tag>`, base64url; the version
 * prefix lets the scheme change without guessing at old rows.
 *
 * Pure apart from WebCrypto (deterministic for a given IV); the IV comes in as
 * an argument, from the runtime's CSPRNG, never generated here.
 */

export const SECRET_BOX_IV_BYTES = 12;
const VERSION = "v1";

export async function deriveSecretBoxKey(keyMaterial: string, purpose: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(keyMaterial), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(purpose) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(key: CryptoKey, plaintext: string, iv: Uint8Array<ArrayBuffer>): Promise<string> {
  if (iv.length !== SECRET_BOX_IV_BYTES) throw new Error(`secret-box: IV must be ${SECRET_BOX_IV_BYTES} bytes`);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${VERSION}.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

/** The plaintext, or null when the value is malformed, from another key, or tampered with. */
export async function open(key: CryptoKey, sealed: string): Promise<string | null> {
  const [version, ivText, bodyText, ...rest] = sealed.split(".");
  if (version !== VERSION || ivText === undefined || bodyText === undefined || rest.length > 0) return null;
  const iv = decodeBase64Url(ivText);
  const body = decodeBase64Url(bodyText);
  if (!iv || !body || iv.length !== SECRET_BOX_IV_BYTES) return null;
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, body);
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    // GCM's tag check is the only signal: wrong key and tampering both land here. Expected, so a value, not a throw.
    if (error instanceof DOMException && error.name === "OperationError") return null;
    throw error;
  }
}
