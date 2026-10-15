/** Where a tap lands when a link is missing or points outside the staff console. */
export const FALLBACK_PATH = "/internal/dashboard";

const MAX_PATH_LENGTH = 512;
const BASE = "https://console.invalid";

/**
 * The same-origin PATH of a console link, or the dashboard.
 *
 * A push carries a path, not a URL: the service worker resolves it against its own origin, so a notification can
 * never open anywhere but the console. Callers build absolute links (an email needs one); this keeps only the path
 * and query, and only when it resolves under `/internal/` — `new URL` first, so `/internal/../x` and `//evil/x` are
 * judged by where they point rather than how they are spelled.
 */
export function toInternalPath(link: string): string {
  const resolved = URL.canParse(link, BASE) ? new URL(link, BASE) : null;
  if (resolved === null) return FALLBACK_PATH;
  const inConsole = resolved.pathname === "/internal" || resolved.pathname.startsWith("/internal/");
  const path = `${resolved.pathname}${resolved.search}`;
  return inConsole && path.length <= MAX_PATH_LENGTH ? path : FALLBACK_PATH;
}

/** The last path segment — a ticket's id, from its console link. Empty for a path with none. */
export function lastSegment(path: string): string {
  const segments = path.split("?")[0]?.split("/").filter((segment) => segment.length > 0) ?? [];
  return segments[segments.length - 1] ?? "";
}
