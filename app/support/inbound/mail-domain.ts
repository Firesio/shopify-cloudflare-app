import { supportAddress } from "./reply-address";

const NOT_MAILABLE = /(^localhost$|\.localhost$|\.workers\.dev$|\.trycloudflare\.com$|\.local$|^\d{1,3}(\.\d{1,3}){3}$)/;

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * The domain this app's support mail lives on, taken from the app's own URL.
 *
 * Each app has its own subdomain (`vip.firesio.app`), so deriving it keeps
 * shared code free of any app's name. A URL that cannot receive mail (local
 * development, a workers.dev preview, a bare IP) yields null, and the reply
 * address is then simply left off rather than pointing nowhere.
 *
 * `override` is for the one case the URL cannot answer: trying the reply flow
 * locally, where the app URL is a tunnel but the address under test is not. A
 * malformed override is ignored rather than trusted.
 */
export function supportMailDomain(appUrl: string, override = ""): string | null {
  const forced = override.trim().toLowerCase();
  if (HOSTNAME.test(forced)) return forced;
  const host = URL.canParse(appUrl) ? new URL(appUrl).hostname.toLowerCase() : "";
  if (host === "" || !host.includes(".") || NOT_MAILABLE.test(host)) return null;
  return host;
}

/** `support@<mail domain>`, or null where the app has no domain that can receive mail. */
export function supportEmailFor(appUrl: string, override = ""): string | null {
  const domain = supportMailDomain(appUrl, override);
  return domain === null ? null : supportAddress(domain);
}
