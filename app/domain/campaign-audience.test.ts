import { describe, expect, it } from "vitest";
import {
  AUDIENCE_FILTER_KEYS,
  AUDIENCE_FILTER_SPECS,
  AUDIENCE_KINDS,
  DEFAULT_AUDIENCE,
  describeAudience,
  isAudienceKind,
} from "./campaign-audience";

const JAN_1_2026 = Date.UTC(2026, 0, 1);

describe("DEFAULT_AUDIENCE", () => {
  it("is real stores with no date bounds: test stores are not who an announcement is for", () => {
    expect(DEFAULT_AUDIENCE).toEqual({ kind: "real", installedAfter: null, installedBefore: null });
  });
});

describe("describeAudience", () => {
  it("says the store kind and nothing else when nothing narrows it further", () => {
    expect(describeAudience(DEFAULT_AUDIENCE)).toEqual(["Real stores only (development stores left out)"]);
  });

  it("adds a line per active filter, in a fixed order", () => {
    expect(describeAudience({ kind: "all", installedAfter: JAN_1_2026, installedBefore: Date.UTC(2026, 5, 30) })).toEqual([
      "Real and development stores",
      "Installed on or after Jan 1, 2026",
      "Installed before Jun 30, 2026",
    ]);
  });

  it("describes every kind", () => {
    for (const kind of AUDIENCE_KINDS) {
      expect(AUDIENCE_FILTER_SPECS.kind.describe({ ...DEFAULT_AUDIENCE, kind })).toBeTruthy();
    }
  });

  it("has words for every filter key", () => {
    for (const key of AUDIENCE_FILTER_KEYS) expect(typeof AUDIENCE_FILTER_SPECS[key].describe).toBe("function");
  });
});

describe("isAudienceKind", () => {
  it("accepts the declared kinds and nothing else", () => {
    for (const kind of AUDIENCE_KINDS) expect(isAudienceKind(kind)).toBe(true);
    for (const value of ["", "Real", "paid", "__proto__"]) expect(isAudienceKind(value)).toBe(false);
  });
});
