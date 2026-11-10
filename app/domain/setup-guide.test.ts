import { describe, expect, it } from "vitest";
import { firstIncompleteIndex, setupProgress } from "./setup-guide";

const steps = (...flags: boolean[]) => flags.map((complete) => ({ complete }));

describe("setupProgress", () => {
  it("counts the completed steps out of all of them", () => {
    expect(setupProgress(steps(true, false, false))).toEqual({ done: 1, total: 3 });
    expect(setupProgress(steps(true, true, true))).toEqual({ done: 3, total: 3 });
    expect(setupProgress(steps(false, false))).toEqual({ done: 0, total: 2 });
  });

  it("is zero of zero for no steps", () => {
    expect(setupProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("firstIncompleteIndex", () => {
  it("opens the first step still to do, not a finished one", () => {
    expect(firstIncompleteIndex(steps(true, false, false))).toBe(1);
    expect(firstIncompleteIndex(steps(false, true))).toBe(0);
  });

  it("is none when everything is done or there are no steps", () => {
    expect(firstIncompleteIndex(steps(true, true))).toBeNull();
    expect(firstIncompleteIndex([])).toBeNull();
  });
});
