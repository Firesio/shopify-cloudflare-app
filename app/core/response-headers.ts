const HSTS = "max-age=31536000; includeSubDomains";

const PUBLIC_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  // The landing's install form posts to /auth/login, which redirects to Shopify's OAuth install page. Browsers apply
  // form-action to every redirect of a form submission, so 'self' alone blocks the install.
  "form-action 'self' https://admin.shopify.com https://*.myshopify.com",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self'",
].join("; ");

// The support form embeds Turnstile, which loads a script and a frame from Cloudflare.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const SUPPORT_CSP = PUBLIC_CSP.replace("script-src 'self' 'unsafe-inline'", `script-src 'self' 'unsafe-inline' ${TURNSTILE_ORIGIN}`).concat(`; frame-src ${TURNSTILE_ORIGIN}`);

/**
 * The surfaces that are NOT public pages: the embedded admin (Shopify's own `frame-ancestors` CSP, set in entry.server, and
 * App Bridge, which a restrictive policy would break), the OAuth pages (they load App Bridge too), the webhook receiver and the
 * health check (no document at all). Everything else is a public page, a 404 or an unknown address, and gets the strict policy:
 * default-deny, so a route added later is covered without anybody remembering to list it.
 */
const OWN_POLICY_PREFIXES = ["/app", "/auth", "/webhooks", "/healthz"];

/**
 * The path as the router matches it: React Router ignores case and a trailing slash, so `/Support/` is the support page and
 * `/APP` the embedded one, and the policy has to be chosen for the page that will answer, not for how the address was typed.
 */
function routeOf(pathname: string): string {
  const path = pathname.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

function hasOwnPolicy(route: string): boolean {
  return OWN_POLICY_PREFIXES.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

/**
 * Every security header, for EVERY response of the Worker (`workers/app.ts` calls this on the final response, so a resource
 * route, an error and a redirect are covered as well as a rendered document): `nosniff`, the referrer policy and, over https,
 * HSTS everywhere; `X-Frame-Options` and the strict Content-Security-Policy on everything outside {@link OWN_POLICY_PREFIXES}.
 */
export function applySecurityHeaders(request: Request, headers: Headers): Headers {
  const url = new URL(request.url);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", HSTS);
  }

  const route = routeOf(url.pathname);
  if (!hasOwnPolicy(route)) {
    headers.set("X-Frame-Options", "DENY");
    headers.set("Content-Security-Policy", route === "/support" ? SUPPORT_CSP : PUBLIC_CSP);
  }

  return headers;
}

/** The response with the security headers on it: a copy, because the headers of a response that came from `fetch` or `Response.redirect` are immutable. */
export function withSecurityHeaders(request: Request, response: Response): Response {
  const headers = applySecurityHeaders(request, new Headers(response.headers));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
