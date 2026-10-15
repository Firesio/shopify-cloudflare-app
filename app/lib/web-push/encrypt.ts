/**
 * Web Push message encryption: RFC 8291 key agreement on top of the RFC 8188 `aes128gcm` content coding. Pure: the
 * salt and the sender's ephemeral key are parameters, so the same inputs always produce the same body.
 *
 * Verified against RFC 8291 Appendix A (see `encrypt.test.ts`).
 */

import { err, ok, type Result } from "~/lib/result";
import { importP256PublicKey, isUncompressedP256Point, type P256KeyPair } from "~/lib/web-push/keys";

const textEncoder = new TextEncoder();

const SALT_BYTES = 16;
const AUTH_SECRET_BYTES = 16;
const RECORD_SIZE = 4096;
const TAG_BYTES = 16;
const PADDING_DELIMITER = 0x02; // the last (here: only) record, RFC 8188 section 2
const KEY_ID_BYTES = 65;
/** salt (16) + rs (4) + idlen (1) + keyid (65). */
export const ENCRYPTED_HEADER_BYTES = SALT_BYTES + 4 + 1 + KEY_ID_BYTES;
/** The size a push service is required to accept (RFC 8030 section 7.2). */
export const MAX_PUSH_BODY_BYTES = 4096;
/** 4096 - 86 (header) - 1 (padding delimiter) - 16 (tag) = 3993 (RFC 8291 section 4). */
export const MAX_PLAINTEXT_BYTES = MAX_PUSH_BODY_BYTES - ENCRYPTED_HEADER_BYTES - 1 - TAG_BYTES;

const KEY_INFO_PREFIX = textEncoder.encode("WebPush: info\0");
const CEK_INFO = textEncoder.encode("Content-Encoding: aes128gcm\0");
const NONCE_INFO = textEncoder.encode("Content-Encoding: nonce\0");

export interface EncryptPayloadInput {
  readonly plaintext: Uint8Array;
  /** The subscription's `p256dh`: the browser's 65-byte uncompressed ECDH public key. */
  readonly userAgentPublicKey: Uint8Array;
  /** The subscription's `auth`: 16 secret bytes. */
  readonly authSecret: Uint8Array;
  /** 16 random bytes, fresh for every message (RFC 8188 section 2.1). */
  readonly salt: Uint8Array;
  /** A fresh ECDH key pair for this message only. */
  readonly senderKeys: P256KeyPair;
}

export type EncryptPayloadFailure =
  | "invalid_user_agent_key"
  | "invalid_auth_secret"
  | "invalid_salt"
  | "invalid_sender_key"
  | "payload_too_large";

function concat(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(
  secret: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, base, bytes * 8);
  return new Uint8Array(bits);
}

/** The 86-byte coding header: salt, record size, key id length, and the sender's public key as the key id. */
function codingHeader(salt: Uint8Array, senderPublicKey: Uint8Array): Uint8Array<ArrayBuffer> {
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, RECORD_SIZE);
  return concat(salt, size, Uint8Array.of(senderPublicKey.length), senderPublicKey);
}

/**
 * The full request body for one push message. Fails with a reason when an input is malformed or the message cannot
 * fit in the 4096 bytes every push service must accept.
 */
export async function encryptPayload(
  input: EncryptPayloadInput,
): Promise<Result<Uint8Array<ArrayBuffer>, EncryptPayloadFailure>> {
  const { plaintext, userAgentPublicKey, authSecret, salt, senderKeys } = input;
  if (!isUncompressedP256Point(userAgentPublicKey)) return err("invalid_user_agent_key");
  if (authSecret.length !== AUTH_SECRET_BYTES) return err("invalid_auth_secret");
  if (salt.length !== SALT_BYTES) return err("invalid_salt");
  if (!isUncompressedP256Point(senderKeys.publicKey)) return err("invalid_sender_key");
  if (plaintext.length > MAX_PLAINTEXT_BYTES) return err("payload_too_large");

  const uaKey = await importUserAgentKey(userAgentPublicKey);
  if (uaKey === null) return err("invalid_user_agent_key");

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, senderKeys.privateKey, 256),
  );
  const keyInfo = concat(KEY_INFO_PREFIX, userAgentPublicKey, senderKeys.publicKey);
  const ikm = await hkdf(ecdhSecret, new Uint8Array(authSecret), keyInfo, 32);
  const contentKey = await hkdf(ikm, new Uint8Array(salt), CEK_INFO, 16);
  const nonce = await hkdf(ikm, new Uint8Array(salt), NONCE_INFO, 12);

  const key = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const record = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: TAG_BYTES * 8 },
    key,
    concat(plaintext, Uint8Array.of(PADDING_DELIMITER)),
  );
  return ok(concat(codingHeader(salt, senderKeys.publicKey), new Uint8Array(record)));
}

/** `null` when the bytes are not a point on P-256. */
async function importUserAgentKey(publicKey: Uint8Array): Promise<CryptoKey | null> {
  try {
    return await importP256PublicKey(publicKey, "ECDH");
  } catch (error) {
    if (error instanceof DOMException || error instanceof TypeError) return null;
    throw error;
  }
}
