import { describe, expect, it } from "vitest";
import { trendOf } from "./metric-trend";

describe("trendOf", () => {
  it.each([
    [0.125, "up"],
    [Number.MIN_VALUE, "up"],
    [-0.008, "down"],
    [-1, "down"],
    [0, "flat"],
    [-0, "flat"],
    [Number.NaN, "flat"],
    [Number.POSITIVE_INFINITY, "flat"],
    [Number.NEGATIVE_INFINITY, "flat"],
  ] as const)("reads %s as %s", (change, expected) => {
    expect(trendOf(change)).toBe(expected);
  });
});
