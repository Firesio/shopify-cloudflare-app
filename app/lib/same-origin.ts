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
