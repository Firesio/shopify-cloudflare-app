/**
 * CSRF guard for a state-changing request: when the browser says where the
 * request came from (`Origin`), it must be this site. Browsers send `Origin` on
 * every cross-origin POST and on same-origin ones too, so a request without it
 * is a non-browser client (a script, a test) and is judged by its session alone.
 * The app's own configured URL is accepted as well as the URL the Worker saw. A literal `Origin: null` (sandboxed frame, redirect chain) is refused.
 */
export function isSameOriginRequest(originHeader: string | null, requestUrl: string, appUrl?: string): boolean {
  if (originHeader === null) return true;
  if (!URL.canParse(originHeader) || !URL.canParse(requestUrl)) return false;
  const origin = new URL(originHeader).origin;
  if (origin === new URL(requestUrl).origin) return true;
  // Behind a tunnel or proxy the Worker can see the request as http while the browser's Origin is https (the app's
  // real address). The configured app URL is this site's own origin, so it is accepted too.
  return appUrl !== undefined && URL.canParse(appUrl) && origin === new URL(appUrl).origin;
}

const RESOLUTION_ORIGIN = "https://this-site.invalid";

/**
 * A path on THIS site that is safe to redirect to, or `fallback`. The value is RESOLVED the way a browser resolves it (the
 * URL standard treats `\` as `/`, drops tabs and newlines, and reads `//host` as another site), and accepted only when the
 * result is still on this origin; what is returned is the resolved path, so no spelling of another site can survive.
 * `"/\\evil.com"` and `"//evil.com"` resolve to another origin and are refused; `"/pricing?x=1"` is kept.
 */
export function safeReturnPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || !URL.canParse(value, RESOLUTION_ORIGIN)) return fallback;
  const resolved = new URL(value, RESOLUTION_ORIGIN);
  return resolved.origin === RESOLUTION_ORIGIN ? `${resolved.pathname}${resolved.search}${resolved.hash}` : fallback;
}
