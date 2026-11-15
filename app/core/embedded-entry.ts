/**
 * Whether a request to `/app` is somebody opening the app's address directly, with nothing that says which shop it is for.
 *
 * Shopify opens the embedded app with `shop` (and `host`, `id_token`) in the query; every later fetch from inside the admin
 * frame carries the session token in `Authorization`; a client-side navigation asks for `*.data`. A GET with none of those is a
 * person (or a crawler) typing the address: there is no shop to authenticate, so the library would answer an App Bridge page
 * that never finishes loading, or a bare `410 Gone` to anything it takes for a bot. The right answer is the landing page.
 */
export function opensAppWithoutShop(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const url = new URL(request.url);
  if (url.pathname.endsWith(".data")) return false;
  if (url.searchParams.has("shop") || url.searchParams.has("id_token")) return false;
  return !request.headers.has("Authorization");
}
