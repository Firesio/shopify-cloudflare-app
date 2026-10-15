import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./same-origin";

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
});
