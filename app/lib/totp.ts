/**
 * TOTP (RFC 6238) over HOTP (RFC 4226), HMAC-SHA1, 30-second steps, 6 digits:
 * the parameters every authenticator app (Google Authenticator, 1Password,
 * Authy, Microsoft Authenticator) uses by default, so no app needs configuring.
 *
 * Pure: the time comes in as an argument, and WebCrypto's HMAC is deterministic.
 * The single-use rule (a code is accepted once) needs storage, so it is the
 * caller's: `verifyTotp` returns the matched step and refuses any step at or
 * before `lastStep`.
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next step too: phones drift, and a code typed at :29 arrives at :31. */
const DRIFT_STEPS = 1;
/** 160 bits, the HMAC-SHA1 block-friendly size RFC 4226 recommends. */
export const TOTP_SECRET_BYTES = 20;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 without padding: the form authenticator apps accept for a typed-in key. */
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32.charAt((value << (5 - bits)) & 31);
  return out;
}

/** The bytes of a base32 key, ignoring case, spaces and padding; null when a character is not base32. */
export function decodeBase32(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = text.replace(/[\s=]/g, "").toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** The time step `now` (epoch ms) falls in. */
export function totpStep(now: number): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

/** RFC 4226 HOTP value for `counter`, zero-padded to `digits`. */
export async function hotp(secret: Uint8Array<ArrayBuffer>, counter: number, digits = TOTP_DIGITS): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    ((mac[offset + 1] ?? 0) << 16) |
    ((mac[offset + 2] ?? 0) << 8) |
    (mac[offset + 3] ?? 0);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export type TotpCheck = { readonly ok: true; readonly step: number } | { readonly ok: false };

/**
 * Whether `code` is valid at `now`, within one step of drift, and newer than
 * `lastStep` (null when no code was ever accepted). Every candidate is
 * computed and compared in full, so the time taken does not reveal which
 * window, if any, matched.
 */
export async function verifyTotp(
  secret: Uint8Array<ArrayBuffer>,
  code: string,
  now: number,
  lastStep: number | null,
): Promise<TotpCheck> {
  const typed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(typed)) return { ok: false };
  const current = totpStep(now);
  let matched: number | null = null;
  for (let step = current - DRIFT_STEPS; step <= current + DRIFT_STEPS; step += 1) {
    const expected = await hotp(secret, step);
    if (constantTimeEqual(expected, typed) && matched === null && (lastStep === null || step > lastStep)) matched = step;
  }
  return matched === null ? { ok: false } : { ok: true, step: matched };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The `otpauth://` URI an authenticator app imports (Key Uri Format). Issuer
 * appears both as the label prefix and the parameter, which is what the apps
 * that disagree with each other all accept.
 */
export function otpauthUri(input: { readonly issuer: string; readonly account: string; readonly secret: string }): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
