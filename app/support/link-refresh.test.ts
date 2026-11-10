import { describe, expect, it } from "vitest";
import { LINK_REFRESH_MIN_GAP_MS, shouldRefreshLinks, withFreshLinks } from "./link-refresh";

describe("shouldRefreshLinks", () => {
  it("refreshes the first time a file fails", () => {
    expect(shouldRefreshLinks({ lastRefreshAt: null, now: 1 })).toBe(true);
  });

  it("does not ask again straight away, so a file that is really gone cannot loop", () => {
    expect(shouldRefreshLinks({ lastRefreshAt: 1_000, now: 1_000 + LINK_REFRESH_MIN_GAP_MS - 1 })).toBe(false);
  });

  it("asks again once the gap has passed, for a page left open for hours", () => {
    expect(shouldRefreshLinks({ lastRefreshAt: 1_000, now: 1_000 + LINK_REFRESH_MIN_GAP_MS })).toBe(true);
  });
});

describe("withFreshLinks", () => {
  const messages = [
    { id: "m1", body: "one", attachments: [{ id: "a1", url: "/old/a1", filename: "a.png" }, { id: "a2", url: "/old/a2", filename: "b.png" }] },
    { id: "m2", body: "two", attachments: [] },
  ];

  it("swaps only the url of each attachment that has a fresh one", () => {
    const next = withFreshLinks(messages, [{ id: "a2", url: "/new/a2" }]);
    expect(next[0]?.attachments.map((file) => file.url)).toEqual(["/old/a1", "/new/a2"]);
    expect(next[0]?.attachments[1]?.filename).toBe("b.png");
    expect(next[1]).toEqual(messages[1]);
  });

  it("leaves the originals untouched", () => {
    withFreshLinks(messages, [{ id: "a1", url: "/new/a1" }]);
    expect(messages[0]?.attachments[0]?.url).toBe("/old/a1");
  });

  it("ignores a link for an attachment the thread does not have", () => {
    expect(withFreshLinks(messages, [{ id: "ghost", url: "/new/ghost" }])).toEqual(messages);
  });
});
