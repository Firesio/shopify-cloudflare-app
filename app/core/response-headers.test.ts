import { describe, expect, it } from "vitest";
import { applySecurityHeaders, withSecurityHeaders } from "./response-headers";

const headerValue = (path: string, name: string, protocol = "https:") => {
  const headers = new Headers();
  applySecurityHeaders(
    new Request(`${protocol}//example.test${path}`),
    headers,
  );
  return headers.get(name);
};

describe("applySecurityHeaders", () => {
  it("sets nosniff and referrer policy on every route, embedded or not, document or not", () => {
    for (const path of ["/", "/support", "/app", "/auth/login", "/webhooks/app/uninstalled", "/healthz", "/nope"]) {
      const headers = new Headers();
      applySecurityHeaders(new Request(`https://example.test${path}`), headers);

      expect(headers.get("X-Content-Type-Options"), path).toBe("nosniff");
      expect(headers.get("Referrer-Policy"), path).toBe(
        "strict-origin-when-cross-origin",
      );
    }
  });

  it("sets HSTS only for HTTPS requests", () => {
    expect(headerValue("/", "Strict-Transport-Security", "https:")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(headerValue("/", "Strict-Transport-Security", "http:")).toBeNull();
  });

  it("denies framing for the public pages", () => {
    const headers = new Headers();
    applySecurityHeaders(new Request("https://example.test/legal/terms"), headers);

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("lets the landing's install form follow the OAuth redirect to Shopify", () => {
    const csp = headerValue("/", "Content-Security-Policy") ?? "";
    const formAction = csp.split("; ").find((directive) => directive.startsWith("form-action"));

    expect(formAction).toBe("form-action 'self' https://admin.shopify.com https://*.myshopify.com");
  });

});

describe("applySecurityHeaders scoping", () => {
  it("does not overwrite Shopify's embedded frame policy for app routes", () => {
    const headers = new Headers({
      "Content-Security-Policy":
        "frame-ancestors https://admin.shopify.com https://merchant.myshopify.com;",
    });

    applySecurityHeaders(new Request("https://example.test/app"), headers);

    expect(headers.get("X-Frame-Options")).toBeNull();
    expect(headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors https://admin.shopify.com https://merchant.myshopify.com;",
    );
  });

  it("keeps the public CSP scoped to the assets used by the public layout", () => {
    const csp = headerValue("/legal/privacy", "Content-Security-Policy");

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("cdn.shopify.com");
    expect(csp).not.toContain("fonts.googleapis.com");
    expect(csp).not.toContain("fonts.gstatic.com");
  });
});

describe("the strict policy is the default", () => {
  const strict = (path: string) => headerValue(path, "Content-Security-Policy");

  it("covers every address that is not one of the four surfaces with their own policy, however it is typed", () => {
    for (const path of ["/", "/legal/privacy/", "/anything", "/deeply/nested/unknown", "/support/", "/Support", "//support", "/application", "/apple", "/authors", "/healthz-not", "/webhooks-x"]) {
      expect(strict(path), path).toContain("default-src 'self'");
      expect(headerValue(path, "X-Frame-Options"), path).toBe("DENY");
    }
  });

  it("leaves the embedded admin, the OAuth pages, the webhook receiver and the health check to their own policy, whatever the case or the slashes", () => {
    for (const path of ["/app", "/app/", "/app/plans", "/APP", "/App/Support", "//app/plans", "/auth/login", "/auth/callback/x", "/webhooks/compliance", "/healthz"]) {
      expect(strict(path), path).toBeNull();
      expect(headerValue(path, "X-Frame-Options"), path).toBeNull();
    }
  });

  it("copies a response whose headers are immutable and keeps its status and body", async () => {
    const redirect = withSecurityHeaders(new Request("https://example.test/legal/terms"), Response.redirect("https://example.test/", 302));
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe("https://example.test/");
    expect(redirect.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const page = withSecurityHeaders(new Request("https://example.test/healthz"), new Response('{"ok":true}', { status: 201, headers: { "Content-Type": "application/json" } }));
    expect(page.status).toBe(201);
    expect(page.headers.get("Content-Type")).toBe("application/json");
    expect(page.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(await page.text()).toBe('{"ok":true}');
  });
});

describe("Turnstile", () => {
  it("lets only the support page load Turnstile's script and frame", () => {
    const support = headerValue("/support", "Content-Security-Policy") ?? "";
    expect(support).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(support).toContain("frame-src https://challenges.cloudflare.com");
    for (const path of ["/support/", "/SUPPORT"]) {
      expect(headerValue(path, "Content-Security-Policy"), path).toContain("frame-src https://challenges.cloudflare.com");
    }
    for (const path of ["/", "/legal/terms", "/legal/privacy", "/support-us"]) {
      const csp = headerValue(path, "Content-Security-Policy") ?? "";
      expect(csp, path).not.toContain("challenges.cloudflare.com");
    }
  });
});
