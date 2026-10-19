/**
 * What the staff audit trail records about one console request, derived from
 * the request alone (pure: no I/O, no clock).
 *
 * The query string is dropped on purpose: a search box can hold a merchant's
 * email, and the trail must not become a second copy of the data it protects.
 * The shop is pulled out of the path (or a `?shop=` parameter) only so the
 * tenant purge can find and erase this row on `shop/redact`.
 */
export type StaffAuditKind =
  | "access"
  | "login"
  | "logout"
  | "mfa_challenge_failed"
  | "mfa_enabled"
  | "mfa_disabled"
  | "mfa_reset"
  | "recovery_code_used";

export interface ConsoleRequest {
  readonly method: string;
  readonly path: string;
  readonly shop: string | null;
}

/** React Router's single-fetch data requests end in `.data`; `/_root.data` is the index. */
const DATA_SUFFIX = /\.data$/;
const SHOP_PATH = /^\/internal\/shops\/([^/]+)/;

export function describeConsoleRequest(method: string, url: URL): ConsoleRequest {
  const stripped = url.pathname.replace(DATA_SUFFIX, "");
  const path = stripped === "/_root" ? "/" : stripped;
  return { method: method.toUpperCase(), path, shop: shopOf(path, url.searchParams.get("shop")) };
}

function shopOf(path: string, param: string | null): string | null {
  const segment = SHOP_PATH.exec(path)?.[1];
  const raw = segment === undefined ? param : decodeSegment(segment);
  const shop = raw?.trim().toLowerCase() ?? "";
  return shop === "" ? null : shop;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape is still the literal the staff member requested; keep it rather than lose the attribution.
    return segment;
  }
}
