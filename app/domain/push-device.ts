import type { DeviceKind } from "~/ports/push-subscriptions";

/**
 * Pure decisions about a push registration: what to call the device, and whether
 * its push-service URL may be contacted at all. No I/O, no clock, no environment.
 */

/** A user agent is attacker-controlled free text; only a bounded prefix is ever inspected. */
const MAX_USER_AGENT_LENGTH = 512;

export interface DeviceDescription {
  readonly label: string;
  readonly kind: DeviceKind;
}

type Matcher = (ua: string) => boolean;
interface NamedRule {
  readonly name: string;
  readonly matches: Matcher;
}

const has = (needle: string): Matcher => (ua) => ua.includes(needle);
const either = (first: string, second: string): Matcher => (ua) => ua.includes(first) || ua.includes(second);

/**
 * Order matters: Edge, Opera and Samsung Internet all say "Chrome" too, and
 * every Chromium and iOS browser says "Safari", so the specific names go first.
 */
const BROWSERS: readonly NamedRule[] = [
  { name: "Edge", matches: (ua) => ua.includes("Edg/") || ua.includes("EdgA/") || ua.includes("EdgiOS/") },
  { name: "Opera", matches: either("OPR/", "OPiOS/") },
  { name: "Samsung Internet", matches: has("SamsungBrowser/") },
  { name: "Firefox", matches: either("Firefox/", "FxiOS/") },
  { name: "Chrome", matches: either("Chrome/", "CriOS/") },
  { name: "Safari", matches: (ua) => ua.includes("Safari/") && ua.includes("Version/") },
];

/** iPhone and iPad before "Mac OS X" (iOS user agents contain it) and Android before Linux. */
const SYSTEMS: readonly NamedRule[] = [
  { name: "iPhone", matches: either("iPhone", "iPod") },
  { name: "iPad", matches: has("iPad") },
  { name: "Android", matches: has("Android") },
  { name: "Windows", matches: has("Windows") },
  { name: "ChromeOS", matches: has("CrOS") },
  { name: "macOS", matches: has("Macintosh") },
  { name: "Linux", matches: either("Linux", "X11") },
];

function firstMatch(rules: readonly NamedRule[], ua: string): string | undefined {
  return rules.find((rule) => rule.matches(ua))?.name;
}

function kindOf(system: string | undefined, ua: string): DeviceKind {
  if (system === "iPhone") return "phone";
  if (system === "iPad") return "tablet";
  // Android phones say "Mobile"; Android tablets do not.
  if (system === "Android") return ua.includes("Mobile") ? "phone" : "tablet";
  return "desktop";
}

function labelOf(browser: string | undefined, system: string | undefined): string {
  if (!browser) return system ? `Unknown browser on ${system}` : "Unknown browser";
  return system ? `${browser} on ${system}` : browser;
}

/**
 * A short human label ("Chrome on Android") and a device kind from a user agent.
 *
 * Never throws and never echoes the user agent: the label is assembled from our
 * own fixed names, so it is bounded and cannot carry markup or a tracking string.
 * An unrecognised agent becomes "Unknown browser" on a desktop.
 */
export function describeDevice(userAgent: string): DeviceDescription {
  const ua = typeof userAgent === "string" ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : "";
  const system = firstMatch(SYSTEMS, ua);
  return { label: labelOf(firstMatch(BROWSERS, ua), system), kind: kindOf(system, ua) };
}

/**
 * OUR allowlist of push services — not a Shopify or W3C rule. The Worker POSTs to
 * whatever endpoint a staff member registers, so an unrestricted endpoint is a
 * server-side request forgery primitive. These are the services behind the
 * browsers we support; a push service not listed fails closed and is added here
 * deliberately. Each entry matches the host itself and its subdomains.
 */
const PUSH_SERVICE_DOMAINS: readonly string[] = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export const MAX_PUSH_ENDPOINT_LENGTH = 2048;

/** Printable ASCII only: control characters (which URL parsers silently strip), spaces and non-ASCII are refused. */
const NOT_PRINTABLE_ASCII = /[^!-~]/;
const HTTPS_PREFIX = "https://";
/** Lower-case letters, digits, dots and hyphens: no userinfo, port, IPv6 bracket, backslash, percent or IDN. */
const PLAIN_HOST = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

function isAllowedHost(host: string): boolean {
  return PUSH_SERVICE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** The raw authority: everything between `https://` and the first `/`, `?` or `#`. */
function authorityOf(url: string): string {
  const rest = url.slice(HTTPS_PREFIX.length);
  const end = rest.search(/[/?#]/);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Whether the Worker may send to this push endpoint. https only, a plain
 * lower-case hostname (no credentials, port, IP literal, trailing dot, IDN or
 * odd encoding), and that host must be, or sit under, an allowlisted push
 * service. The raw string is checked first and the parsed URL second, so a
 * disagreement between this check and the later `fetch` cannot be exploited.
 */
export function isAllowedPushEndpoint(url: string): boolean {
  if (typeof url !== "string" || url.length > MAX_PUSH_ENDPOINT_LENGTH) return false;
  if (!url.startsWith(HTTPS_PREFIX) || NOT_PRINTABLE_ASCII.test(url)) return false;

  const host = authorityOf(url);
  if (!PLAIN_HOST.test(host) || !isAllowedHost(host)) return false;

  const parsed = URL.canParse(url) ? new URL(url) : undefined;
  return parsed !== undefined && parsed.protocol === "https:" && parsed.hostname === host
    && parsed.port === "" && parsed.username === "" && parsed.password === "";
}
