import { describe, expect, it } from "vitest";
import { parseAcceptLanguage } from "./accept-language";

describe("parseAcceptLanguage", () => {
  it("orders by weight, not by position", () => {
    expect(parseAcceptLanguage("en;q=0.5, es;q=0.9, fr")).toEqual(["fr", "es", "en"]);
  });
  it("keeps the header's order for equal weights and drops duplicates", () => {
    expect(parseAcceptLanguage("es-MX, en, es-MX;q=0.4")).toEqual(["es-MX", "en"]);
  });
  it("drops `*`, q=0, bad weights and junk", () => {
    expect(parseAcceptLanguage("*, de;q=0, fr;q=2, es;q=abc, !!, en-GB;q=0.8")).toEqual(["en-GB"]);
  });
  it("is empty without a header, and bounded for a hostile one", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
    const hostile = Array.from({ length: 5_000 }, (_, i) => `x${i}`).join(",");
    expect(parseAcceptLanguage(`${hostile},en`).length).toBeLessThanOrEqual(32);
  });
  it("canonicalises what it keeps", () => {
    expect(parseAcceptLanguage("ES-mx;q=0.7")).toEqual(["es-MX"]);
  });
});
