import { describe, expect, it } from "vitest";
import headers from "../public/_headers?raw";

/** The platform default for a static asset is `max-age=0, must-revalidate`: every chunk revalidated on every load. */
function rule(path: string): string[] {
  const lines = headers.split("\n");
  const start = lines.findIndex((line) => line.trim() === path);
  if (start < 0) return [];
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    body.push(line.trim());
  }
  return body;
}

describe("public/_headers", () => {
  it("caches the content-hashed bundles for a year, immutable", () => {
    expect(rule("/assets/*")).toContain("Cache-Control: public, max-age=31536000, immutable");
  });

  it("never marks a stable URL immutable", () => {
    for (const path of ["/internal-sw.js", "/illustrations/*", "/plan-cards/*"]) {
      expect(rule(path).join("\n")).not.toContain("immutable");
    }
  });

  it("keeps the service worker revalidating on every navigation", () => {
    expect(rule("/internal-sw.js")).toContain("Cache-Control: no-cache");
  });
});
