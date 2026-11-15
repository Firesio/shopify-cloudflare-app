import { describe, expect, it } from "vitest";
import { opensAppWithoutShop } from "./embedded-entry";

const get = (path: string, headers: Record<string, string> = {}, method = "GET") => new Request(`https://example.test${path}`, { method, headers });

describe("opensAppWithoutShop", () => {
  it("is true for an address typed with no shop, whatever the page or the client", () => {
    expect(opensAppWithoutShop(get("/app"))).toBe(true);
    expect(opensAppWithoutShop(get("/app/plans"))).toBe(true);
    expect(opensAppWithoutShop(get("/app", { "user-agent": "curl/8" }))).toBe(true);
    expect(opensAppWithoutShop(get("/app?embedded=1&host=abc"))).toBe(true);
    expect(opensAppWithoutShop(get("/app", {}, "HEAD"))).toBe(true);
  });

  it("is false when Shopify opened the app: a shop or an id_token in the query", () => {
    expect(opensAppWithoutShop(get("/app?shop=a.myshopify.com&host=abc&embedded=1"))).toBe(false);
    expect(opensAppWithoutShop(get("/app/plans?id_token=abc"))).toBe(false);
  });

  it("is false for what happens inside the admin frame: a session token header and client-side data requests", () => {
    expect(opensAppWithoutShop(get("/app/plans", { Authorization: "Bearer abc" }))).toBe(false);
    expect(opensAppWithoutShop(get("/app/plans.data?_routes=routes%2Fapp%2Fplans"))).toBe(false);
    expect(opensAppWithoutShop(get("/app.data"))).toBe(false);
  });

  it("leaves a form submission alone: the guard and the library decide those", () => {
    expect(opensAppWithoutShop(get("/app/plans", {}, "POST"))).toBe(false);
  });
});
