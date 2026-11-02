import { decodeBase64Url, encodeBase64Url } from "~/lib/base64url";
import { hmacBase64Url, signaturesMatch } from "~/lib/hmac";

/**
 * The link at the foot of an announcement: it names the address and proves we made the link.
 *
 * It carries no expiry, on purpose: an unsubscribe link in a mail from last year must still work, and the only thing it
 * can do is stop us writing to that address. The signature stops anyone unsubscribing an address they were not sent a
 * link for. The payload is prefixed with its purpose, so the same secret signing a support attachment link can never
 * produce a valid one of these.
 */
const PURPOSE = "campaign-unsubscribe:v1:";

/** `<base64url(address)>.<signature>`. The address is lower-cased and trimmed first, so one address has one token. */
export async function signUnsubscribeToken({ secret, address }: { secret: string; address: string }): Promise<string> {
  const normalized = address.trim().toLowerCase();
  return `${encodeBase64Url(new TextEncoder().encode(normalized))}.${await hmacBase64Url(secret, PURPOSE + normalized)}`;
}

/** The address the token was signed for, or undefined for anything that is not a token we signed. */
export async function verifyUnsubscribeToken({ secret, token }: { secret: string; token: string }): Promise<string | undefined> {
  const separator = token.indexOf(".");
  if (separator <= 0) return undefined;
  const encoded = token.slice(0, separator);
  const presented = token.slice(separator + 1);
  if (presented === "") return undefined;

  const bytes = decodeBase64Url(encoded);
  if (bytes === null) return undefined;
  let address: string;
  try {
    address = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  // Only the normalized form is ever signed, so anything else is not ours.
  if (address !== address.trim().toLowerCase() || address === "") return undefined;

  return signaturesMatch(await hmacBase64Url(secret, PURPOSE + address), presented) ? address : undefined;
}
