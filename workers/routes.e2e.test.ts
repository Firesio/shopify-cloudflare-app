import { exports } from "cloudflare:workers";
import { CONTACT_TRAP_FIELD } from "@firesio/app/support";
import { describe, expect, it } from "vitest";

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** The request goes to the real Worker's `fetch`; `redirect: "manual"` keeps a 302 visible as one instead of following it. */
const get = (path: string, headers: Record<string, string> = { "user-agent": BROWSER }) => exports.default.fetch(new Request(`https://example.test${path}`, { headers, redirect: "manual" }));

const postForm = (fields: Record<string, string>) => {
  const body = new URLSearchParams(fields).toString();
  return exports.default.fetch(
    new Request("https://example.test/support", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "content-length": String(new TextEncoder().encode(body).length), "user-agent": BROWSER }, body }),
  );
};

describe("/auth/*", () => {
  it("answers 400 for a malformed host parameter instead of a 500, on a page that says so without a stack", async () => {
    // A `host` is base64 of the admin host; one that decodes to something no URL can have is the caller's mistake (Shopify's own check throws).
    const response = await get(`/auth/callback?host=${encodeURIComponent(btoa("not a host name"))}`);
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("Error 400");
    expect(html).not.toMatch(/\bat \S+\.(ts|tsx|mjs|js):\d+/);
  });
});

describe("the landing page", () => {
  it("sends a visit that carries ?shop on to the embedded app with the same query", async () => {
    const response = await get("/?shop=landing-shop.myshopify.com&host=abc&embedded=1");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/app?shop=landing-shop.myshopify.com&host=abc&embedded=1");
  });
});

describe("the unsubscribe page", () => {
  const forged = "/unsubscribe?t=forged.token";

  it("is public: the link opens without a Shopify session, and says a forged one is not valid (a GET changes nothing)", async () => {
    const response = await get(forged);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("This unsubscribe link is not valid");
  });

  it("refuses a forged POST, the mail client's one-click form included, with a 400 that says nothing about which addresses are known", async () => {
    const response = await exports.default.fetch(
      new Request(`https://example.test${forged}`, { method: "POST", headers: { "user-agent": BROWSER, "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("This unsubscribe link is not valid");
  });
});

describe("the public support form (POST /support), through the real Worker", () => {
  it("answers a filled decoy field as a success and does nothing with it", async () => {
    const response = await postForm({ name: "Bot", email: "bot@example.org", subject: "Hi", message: "Buy things", [CONTACT_TRAP_FIELD]: "http://spam.example" });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<p class="notice" role="status">Thank you. We will reply by email.</p>');
  });

  it("answers 400 with the field errors for invalid input and keeps what was typed", async () => {
    const response = await postForm({ name: "", email: "not-an-email", subject: "A subject", message: "" });
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("This field is required.");
    expect(html).toContain("Enter a valid email address.");
    expect(html).toContain('value="A subject"');
    // The thanks is in the page's data (the labels travel with the loader) either way: what a person SEES is the status paragraph.
    expect(html).not.toContain('role="status"');
  });

  it("refuses a body declared over 64 KB with 413 before reading it", async () => {
    const big = "x".repeat(64 * 1024 + 1);
    const tooLarge = await exports.default.fetch(
      new Request("https://example.test/support", { method: "POST", headers: { "content-type": "text/plain", "content-length": String(big.length), "user-agent": BROWSER }, body: big }),
    );
    expect(tooLarge.status).toBe(413);
  });
});

describe("/app opened by address, with no shop", () => {
  it("goes to the landing page for a browser and for anything else, never a bare 410", async () => {
    for (const headers of [{ "user-agent": BROWSER }, { "user-agent": "curl/8.7.1" }, { "user-agent": "HeadlessChrome/130.0" }]) {
      const response = await get("/app", headers);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/");
    }
    expect((await get("/app/")).headers.get("location")).toBe("/");
  });

  it("is left to Shopify's own flow once the request names a shop (the App Bridge page that fetches a session token)", async () => {
    const response = await get("/app?shop=landing-shop.myshopify.com&host=abc&embedded=1");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("app-bridge.js");
  });
});

describe("an address nobody serves", () => {
  it("is a 404 page that says so, never React Router's default error page, with the strict policy on it", async () => {
    const response = await get("/no/such/page");
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain("Page not found");
    expect(html).not.toContain("Unhandled Thrown Response");
    expect(html).not.toContain("No route matches");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  });
});

describe("the security headers of the Worker's own responses", () => {
  it("are on a resource route, a redirect and an error alike: nosniff and HSTS everywhere, the strict policy outside the embedded surfaces", async () => {
    for (const path of ["/healthz", "/?shop=a.myshopify.com", "/nope", "/app"]) {
      const response = await get(path);
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(response.headers.get("strict-transport-security"), path).toBe("max-age=31536000; includeSubDomains");
    }
    expect((await get("/healthz")).headers.get("content-security-policy")).toBeNull();
    expect((await get("/support/")).headers.get("content-security-policy")).toContain("frame-src https://challenges.cloudflare.com");
    expect((await get("/Support")).headers.get("x-frame-options")).toBe("DENY");
  });
});
