import { describe, expect, it } from "vitest";
import { FALLBACK_PATH, lastSegment, toInternalPath } from "./internal-path";

describe("toInternalPath", () => {
  it("keeps only the path and query of an absolute console link", () => {
    expect(toInternalPath("https://app.workmanjsc.vn/internal/support/t-1?from=push")).toBe("/internal/support/t-1?from=push");
  });

  it("accepts a path under /internal/ as it is", () => {
    expect(toInternalPath("/internal/shops/alpha.myshopify.com")).toBe("/internal/shops/alpha.myshopify.com");
    expect(toInternalPath("/internal")).toBe("/internal");
  });

  it.each([
    ["a path outside the console", "/app/support/t-1"],
    ["a console look-alike", "/internalx/secret"],
    ["a traversal out of the console", "/internal/../app/home"],
    ["an absolute link to elsewhere", "https://evil.invalid/steal"],
    ["a script URL", "javascript:alert(1)"],
    ["an empty link", ""],
  ])("falls back to the dashboard for %s", (_name, link) => {
    expect(toInternalPath(link)).toBe(FALLBACK_PATH);
  });

  it("never returns another origin, even for a protocol-relative link", () => {
    expect(toInternalPath("//evil.invalid/internal/x")).toBe("/internal/x");
  });

  it("falls back rather than carry a path too long to be a real console link", () => {
    expect(toInternalPath(`/internal/${"a".repeat(600)}`)).toBe(FALLBACK_PATH);
  });
});

describe("lastSegment", () => {
  it("is the final path segment, without the query", () => {
    expect(lastSegment("/internal/support/t-1?x=1")).toBe("t-1");
    expect(lastSegment("/internal/support/t-1/")).toBe("t-1");
  });

  it("is empty for a path with no segments", () => {
    expect(lastSegment("/")).toBe("");
  });
});
