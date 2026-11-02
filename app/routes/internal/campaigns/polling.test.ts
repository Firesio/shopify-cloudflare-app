import { describe, expect, it } from "vitest";
import { MAX_POLLS, POLL_INTERVAL_MS, nextPoll } from "./polling";

describe("nextPoll", () => {
  it("polls while the page is visible and under the ceiling", () => {
    expect(nextPoll({ polls: 0, hidden: false })).toBe("poll");
    expect(nextPoll({ polls: MAX_POLLS - 1, hidden: false })).toBe("poll");
  });

  it("asks nothing while the tab is hidden, and does not count it", () => {
    expect(nextPoll({ polls: 5, hidden: true })).toBe("skip");
  });

  it("stops at the ceiling, hidden or not", () => {
    expect(nextPoll({ polls: MAX_POLLS, hidden: false })).toBe("stop");
    expect(nextPoll({ polls: MAX_POLLS, hidden: true })).toBe("stop");
  });

  it("is bounded to a sensible total time", () => {
    expect((MAX_POLLS * POLL_INTERVAL_MS) / 60_000).toBeLessThanOrEqual(10);
  });
});
