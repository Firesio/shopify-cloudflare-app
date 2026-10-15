/**
 * The RECEIVING side of Web Push encryption (RFC 8291 + RFC 8188), written independently of the encryptor so a
 * round trip proves more than "the encryptor agrees with itself". Test-only: a Worker never decrypts a push message.
 */

import { importP256PrivateKey } from "~/lib/web-push/keys";

const textEncoder = new TextEncoder();

function concat(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** HKDF-SHA256 spelled out as HMAC steps, exactly as RFC 8291 section 3.4 writes it. */
async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const imported = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, data));
}

export interface DecryptInput {
  readonly body: Uint8Array;
  readonly userAgentPrivateKey: Uint8Array;
  readonly userAgentPublicKey: Uint8Array;
  readonly authSecret: Uint8Array;
}

export interface DecryptedPush {
  readonly plaintext: Uint8Array;
  readonly senderPublicKey: Uint8Array;
  readonly salt: Uint8Array;
  readonly recordSize: number;
}

/** Throws when the message does not authenticate or is malformed. */
export async function decryptPush(input: DecryptInput): Promise<DecryptedPush> {
  const { body } = input;
  const salt = body.slice(0, 16);
  const recordSize = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(16);
  const idLength = body[20];
  if (idLength !== 65) throw new Error("key id is not an uncompressed P-256 point");
  const senderPublicKey = body.slice(21, 21 + idLength);
  const record = body.slice(21 + idLength);
  if (record.length > recordSize) throw new Error("more than one record");

  const uaPrivate = await importP256PrivateKey(input.userAgentPublicKey, input.userAgentPrivateKey, "ECDH");
  const senderKey = await crypto.subtle.importKey(
    "raw",
    senderPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: senderKey }, uaPrivate, 256));

  const prkKey = await hmac(new Uint8Array(input.authSecret), ecdhSecret);
  const keyInfo = concat(textEncoder.encode("WebPush: info\0"), input.userAgentPublicKey, senderPublicKey, Uint8Array.of(1));
  const ikm = await hmac(prkKey, keyInfo);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(textEncoder.encode("Content-Encoding: aes128gcm\0"), Uint8Array.of(1)))).slice(0, 16);
  const nonce = (await hmac(prk, concat(textEncoder.encode("Content-Encoding: nonce\0"), Uint8Array.of(1)))).slice(0, 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, record));
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  if (end < 0 || padded[end] !== 0x02) throw new Error("bad padding delimiter");
  return { plaintext: padded.slice(0, end), senderPublicKey, salt, recordSize };
}
