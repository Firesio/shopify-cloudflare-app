import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "./response-headers";

const headerValue = (path: string, name: string, protocol = "https:") => {
  const headers = new Headers();
  applySecurityHeaders(
    new Request(`${protocol}//example.test${path}`),
    headers,
  );
  return headers.get(name);
};

describe("applySecurityHeaders", () => {
  it("sets nosniff and referrer policy on every document route", () => {
    for (const path of ["/", "/support", "/app", "/auth/login"]) {
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

describe("Turnstile", () => {
  it("lets only the support page load Turnstile's script and frame", () => {
    const support = headerValue("/support", "Content-Security-Policy") ?? "";
    expect(support).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(support).toContain("frame-src https://challenges.cloudflare.com");
    for (const path of ["/", "/legal/terms", "/legal/privacy"]) {
      const csp = headerValue(path, "Content-Security-Policy") ?? "";
      expect(csp, path).not.toContain("challenges.cloudflare.com");
    }
  });
});
