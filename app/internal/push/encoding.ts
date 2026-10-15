import { decodeBase64Url } from "~/lib/base64url";

/**
 * The VAPID application server key (base64url) as the bytes `pushManager.subscribe` wants,
 * or null when it is not valid base64url (a misconfigured key must fail visibly, not
 * subscribe against garbage).
 */
export function urlBase64ToUint8Array(key: string): Uint8Array<ArrayBuffer> | null {
  return decodeBase64Url(key);
}

/**
 * Lower-case hex SHA-256 of the push endpoint's UTF-8 bytes. The server stores the same
 * digest (`DeviceView.endpointHash`), so the browser can recognise its own registration
 * without the endpoint ever being sent back to it.
 */
export async function hashEndpoint(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Whether an existing subscription was made with this key; a different one cannot be reused. */
export function sameApplicationServerKey(existing: ArrayBuffer | null, key: Uint8Array): boolean {
  if (existing === null) return false;
  const bytes = new Uint8Array(existing);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}
