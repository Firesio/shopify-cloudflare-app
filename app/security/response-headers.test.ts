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
    for (const path of ["/", "/pricing", "/app", "/internal", "/auth/login"]) {
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

  it("denies framing for internal console routes", () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request("https://example.test/internal/dashboard"),
      headers,
    );

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

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

describe("the internal console's installability and push", () => {
  const csp = () => headerValue("/internal/dashboard", "Content-Security-Policy") ?? "";

  it("lets the console register its service worker and fetch its manifest: both fall back to default-src 'self'", () => {
    const directives = csp().split("; ").map((directive) => directive.split(" ")[0]);
    expect(csp()).toContain("default-src 'self'");
    // An explicit worker-src/manifest-src/child-src could only narrow what default-src already allows.
    for (const narrowing of ["worker-src", "manifest-src", "child-src"]) {
      expect(directives, narrowing).not.toContain(narrowing);
    }
    expect(directives).toContain("script-src");
  });

  it("allows the console's own icons and lets push talk only to this origin", () => {
    expect(csp()).toContain("img-src 'self' data:");
    expect(csp()).toContain("connect-src 'self'");
  });

  it("lets only the support page load Turnstile's script and frame", () => {
    const support = headerValue("/support", "Content-Security-Policy") ?? "";
    expect(support).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(support).toContain("frame-src https://challenges.cloudflare.com");
    for (const path of ["/", "/pricing", "/legal/privacy"]) {
      const csp = headerValue(path, "Content-Security-Policy") ?? "";
      expect(csp, path).not.toContain("challenges.cloudflare.com");
    }
  });
});
