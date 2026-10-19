import { describe, expect, it } from "vitest";
import { describeConsoleRequest } from "./staff-audit";

const at = (path: string) => new URL(`https://app.example.org${path}`);

describe("describeConsoleRequest", () => {
  it("keeps the method and path, and never the query string", () => {
    expect(describeConsoleRequest("post", at("/internal/support/t-1?q=jane%40mail.com"))).toEqual({
      method: "POST",
      path: "/internal/support/t-1",
      shop: null,
    });
  });

  it("strips the single-fetch .data suffix, and maps /_root.data to /", () => {
    expect(describeConsoleRequest("GET", at("/internal/dashboard.data")).path).toBe("/internal/dashboard");
    expect(describeConsoleRequest("GET", at("/_root.data")).path).toBe("/");
  });

  it("takes the shop from a shop detail path, decoded and lower-cased", () => {
    expect(describeConsoleRequest("GET", at("/internal/shops/Acme%2Dstore.myshopify.com")).shop).toBe("acme-store.myshopify.com");
    expect(describeConsoleRequest("GET", at("/internal/shops/acme.myshopify.com.data")).shop).toBe("acme.myshopify.com");
  });

  it("takes the shop from a ?shop= parameter when the path names none", () => {
    expect(describeConsoleRequest("GET", at("/internal/support/new?shop=Beta.myshopify.com")).shop).toBe("beta.myshopify.com");
  });

  it("keeps a malformed escape literally rather than losing the attribution", () => {
    expect(describeConsoleRequest("GET", at("/internal/shops/bad%E0%A4%A")).shop).toBe("bad%e0%a4%a");
  });

  it("has no shop for the shop index, an empty parameter, or other pages", () => {
    expect(describeConsoleRequest("GET", at("/internal/shops")).shop).toBeNull();
    expect(describeConsoleRequest("GET", at("/internal/support/new?shop=%20")).shop).toBeNull();
    expect(describeConsoleRequest("GET", at("/internal/ai")).shop).toBeNull();
  });
});
