import { describe, expect, it } from "vitest";
import { formatPercentChange, percentChange } from "./trend-delta";

describe("percentChange", () => {
  it("is null with no previous value, so no badge is invented", () => {
    expect(percentChange(undefined, 5)).toBeNull();
  });

  it("is null when the previous value is zero (growth from nothing has no percentage)", () => {
    expect(percentChange(0, 5)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it("computes growth, decline and no change", () => {
    expect(percentChange(10, 12)).toBe(20);
    expect(percentChange(10, 8)).toBe(-20);
    expect(percentChange(10, 10)).toBe(0);
  });

  it("rounds to a whole percentage", () => {
    expect(percentChange(3, 4)).toBe(33);
    expect(percentChange(3, 2)).toBe(-33);
    expect(percentChange(200, 201)).toBe(1);
  });

  it("can fall to a full loss", () => {
    expect(percentChange(4, 0)).toBe(-100);
  });
});

describe("formatPercentChange", () => {
  it("signs the direction explicitly", () => {
    expect(formatPercentChange(12)).toBe("+12%");
    expect(formatPercentChange(-8)).toBe("−8%");
    expect(formatPercentChange(0)).toBe("0%");
  });
});
