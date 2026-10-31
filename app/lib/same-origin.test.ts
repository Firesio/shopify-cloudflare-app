import { describe, expect, it } from "vitest";
import { isSameOriginRequest, safeReturnPath } from "./same-origin";

const URL_ = "https://console.workmanjsc.vn/internal/notifications";

describe("isSameOriginRequest", () => {
  it("accepts a request with no Origin header", () => {
    expect(isSameOriginRequest(null, URL_)).toBe(true);
  });
  it("accepts the same origin, whatever the path", () => {
    expect(isSameOriginRequest("https://console.workmanjsc.vn", URL_)).toBe(true);
  });
  it.each([
    ["another host", "https://evil.example"],
    ["a lookalike host", "https://console.workmanjsc.vn.evil.example"],
    ["another scheme", "http://console.workmanjsc.vn"],
    ["another port", "https://console.workmanjsc.vn:8443"],
    ["a subdomain", "https://x.console.workmanjsc.vn"],
    ["the literal null origin", "null"],
    ["garbage", "not a url"],
    ["an empty header", ""],
  ])("rejects %s", (_name, origin) => {
    expect(isSameOriginRequest(origin, URL_)).toBe(false);
  });
  it("rejects when the request url itself is unparseable", () => {
    expect(isSameOriginRequest("https://console.workmanjsc.vn", "nonsense")).toBe(false);
  });

  describe("behind a tunnel or proxy", () => {
    const SEEN = "http://translator.trycloudflare.com/internal/notifications";
    const APP = "https://translator.trycloudflare.com";
    it("accepts the app's own https origin when the Worker saw http", () => {
      expect(isSameOriginRequest(APP, SEEN, APP)).toBe(true);
    });
    it("still rejects the https origin when no app URL is configured", () => {
      expect(isSameOriginRequest(APP, SEEN)).toBe(false);
    });
    it("does not widen the check to other origins", () => {
      expect(isSameOriginRequest("https://evil.example", SEEN, APP)).toBe(false);
      expect(isSameOriginRequest("https://translator.trycloudflare.com.evil.example", SEEN, APP)).toBe(false);
      expect(isSameOriginRequest(APP, SEEN, "not a url")).toBe(false);
    });
  });
});

describe("safeReturnPath", () => {
  it("keeps a path on this site, resolved", () => {
    expect(safeReturnPath("/pricing")).toBe("/pricing");
    expect(safeReturnPath("/support?topic=billing#x")).toBe("/support?topic=billing#x");
    expect(safeReturnPath("/a/../b")).toBe("/b");
  });
  it.each(["//evil.test/x", "/\\evil.test", "/\\/evil.test", "/.//evil.test", "/x/..//evil.test", "/./\\evil.test", "/\t/evil.test", "/\r\n/evil.test", "https://evil.test", "javascript:alert(1)", "evil.test", "", " /pricing", 42, null, undefined])(
    "refuses %j",
    (value) => {
      expect(safeReturnPath(value)).toBe("/");
    },
  );
  it("uses the fallback it is given", () => {
    expect(safeReturnPath("//evil.test", "/app")).toBe("/app");
  });
});
