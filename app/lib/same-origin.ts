/**
 * CSRF guard for a state-changing request: when the browser says where the
 * request came from (`Origin`), it must be this site. Browsers send `Origin` on
 * every cross-origin POST and on same-origin ones too, so a request without it
 * is a non-browser client (a script, a test) and is judged by its session alone.
 * A literal `Origin: null` (sandboxed frame, redirect chain) is refused.
 */
export function isSameOriginRequest(originHeader: string | null, requestUrl: string): boolean {
  if (originHeader === null) return true;
  if (!URL.canParse(originHeader) || !URL.canParse(requestUrl)) return false;
  return new URL(originHeader).origin === new URL(requestUrl).origin;
}
