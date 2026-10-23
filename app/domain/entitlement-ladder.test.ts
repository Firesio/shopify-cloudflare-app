import { describe, expect, it } from "vitest";
import type { EntitlementCatalogue } from "./entitlement-policy";
import { catalogueProblems, firstPlanGranting, firstPlanWithRoom, grantsDiff, ladderOf } from "./entitlement-ladder";

const catalogue: EntitlementCatalogue = {
  version: 1,
  freePlan: "free",
  features: {
    export: { kind: "capability" },
    "seats.max": { kind: "capacity" },
    "docs.monthly": { kind: "quota", period: "calendar_month" },
    sso: { kind: "capability" },
  },
  plans: {
    free: { export: { kind: "disabled" }, "seats.max": { kind: "limit", maximum: 1 }, "docs.monthly": { kind: "limit", maximum: 10 }, sso: { kind: "disabled" } },
    pro: { export: { kind: "enabled" }, "seats.max": { kind: "limit", maximum: 5 }, "docs.monthly": { kind: "limit", maximum: 1000 }, sso: { kind: "disabled" } },
    scale: { export: { kind: "enabled" }, "seats.max": { kind: "unlimited" }, "docs.monthly": { kind: "unlimited" }, sso: { kind: "enabled" } },
  },
};

describe("ladderOf", () => {
  it("is the declared ladder when there is one", () => {
    expect(ladderOf({ ...catalogue, ladder: ["scale", "free", "pro"] })).toEqual(["scale", "free", "pro"]);
  });
  it("is the order the plans were written in otherwise", () => {
    expect(ladderOf(catalogue)).toEqual(["free", "pro", "scale"]);
  });
});

describe("firstPlanGranting", () => {
  it("is the first plan of the ladder that grants a capability", () => {
    expect(firstPlanGranting(catalogue, "export")).toBe("pro");
    expect(firstPlanGranting(catalogue, "sso")).toBe("scale");
  });
  it("follows the declared ladder, not the order the plans were written", () => {
    expect(firstPlanGranting({ ...catalogue, ladder: ["scale", "pro", "free"] }, "export")).toBe("scale");
  });
  it("counts a quota or capacity that has any allowance, a limit of zero excepted", () => {
    expect(firstPlanGranting(catalogue, "seats.max")).toBe("free");
    const none: EntitlementCatalogue = { ...catalogue, plans: { ...catalogue.plans, free: { ...catalogue.plans.free, "docs.monthly": { kind: "limit", maximum: 0 } } } };
    expect(firstPlanGranting(none, "docs.monthly")).toBe("pro");
  });
  it("is null for a key nobody grants and for an unknown key", () => {
    const nobody: EntitlementCatalogue = { ...catalogue, plans: { free: catalogue.plans.free } };
    expect(firstPlanGranting(nobody, "sso")).toBeNull();
    expect(firstPlanGranting(catalogue, "missing")).toBeNull();
    expect(firstPlanGranting(catalogue, "toString")).toBeNull();
  });
});

describe("firstPlanWithRoom", () => {
  it("is the first plan whose allowance covers the amount asked for", () => {
    expect(firstPlanWithRoom(catalogue, "seats.max", 1)).toBe("free");
    expect(firstPlanWithRoom(catalogue, "seats.max", 2)).toBe("pro");
    expect(firstPlanWithRoom(catalogue, "seats.max", 5)).toBe("pro");
    expect(firstPlanWithRoom(catalogue, "seats.max", 6)).toBe("scale");
    expect(firstPlanWithRoom(catalogue, "docs.monthly", 1001)).toBe("scale");
  });
  it("is null when no plan covers it or the key is not a counted one", () => {
    const capped: EntitlementCatalogue = { ...catalogue, plans: { free: catalogue.plans.free, pro: catalogue.plans.pro } };
    expect(firstPlanWithRoom(capped, "seats.max", 6)).toBeNull();
    expect(firstPlanWithRoom(catalogue, "export", 1)).toBeNull();
    expect(firstPlanWithRoom(catalogue, "missing", 1)).toBeNull();
  });
  it("refuses an amount that is not a positive safe integer", () => {
    for (const amount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(firstPlanWithRoom(catalogue, "seats.max", amount)).toBeNull();
    }
  });
});

describe("grantsDiff", () => {
  it("lists what a move changes, key by key, and nothing that stayed", () => {
    expect(grantsDiff(catalogue, "free", "pro")).toEqual([
      { key: "export", change: "gained", before: { kind: "disabled" }, after: { kind: "enabled" } },
      { key: "seats.max", change: "increased", before: { kind: "limit", maximum: 1 }, after: { kind: "limit", maximum: 5 } },
      { key: "docs.monthly", change: "increased", before: { kind: "limit", maximum: 10 }, after: { kind: "limit", maximum: 1000 } },
    ]);
  });
  it("names the same changes as lost and decreased on the way down", () => {
    expect(grantsDiff(catalogue, "scale", "pro")).toEqual([
      { key: "seats.max", change: "decreased", before: { kind: "unlimited" }, after: { kind: "limit", maximum: 5 } },
      { key: "docs.monthly", change: "decreased", before: { kind: "unlimited" }, after: { kind: "limit", maximum: 1000 } },
      { key: "sso", change: "lost", before: { kind: "enabled" }, after: { kind: "disabled" } },
    ]);
  });
  it("treats a limit of zero as gone and unlimited as above any limit", () => {
    const zero: EntitlementCatalogue = { ...catalogue, plans: { ...catalogue.plans, pro: { ...catalogue.plans.pro, "docs.monthly": { kind: "limit", maximum: 0 } } } };
    expect(grantsDiff(zero, "free", "pro")?.find((entry) => entry.key === "docs.monthly")?.change).toBe("lost");
    expect(grantsDiff(zero, "pro", "free")?.find((entry) => entry.key === "docs.monthly")?.change).toBe("gained");
  });
  it("is empty for the same plan and for two plans that grant alike", () => {
    expect(grantsDiff(catalogue, "pro", "pro")).toEqual([]);
    const same: EntitlementCatalogue = { ...catalogue, plans: { ...catalogue.plans, twin: catalogue.plans.pro } };
    expect(grantsDiff(same, "pro", "twin")).toEqual([]);
  });
  it("is null when either plan is not in the catalogue", () => {
    expect(grantsDiff(catalogue, "free", "missing")).toBeNull();
    expect(grantsDiff(catalogue, "missing", "free")).toBeNull();
  });
});

describe("catalogueProblems", () => {
  it("finds none in a consistent catalogue", () => {
    expect(catalogueProblems(catalogue)).toEqual([]);
  });
  it("finds a plan with no grant for a feature", () => {
    const { sso: _removed, ...rest } = catalogue.plans.pro;
    expect(catalogueProblems({ ...catalogue, plans: { ...catalogue.plans, pro: rest } })).toEqual(["plan pro has no grant for sso"]);
  });
  it("finds a grant of the wrong kind for the feature", () => {
    const wrong: EntitlementCatalogue = { ...catalogue, plans: { ...catalogue.plans, pro: { ...catalogue.plans.pro, export: { kind: "limit", maximum: 3 }, "seats.max": { kind: "enabled" } } } };
    expect(catalogueProblems(wrong)).toEqual(["plan pro grants export (capability) a limit", "plan pro grants seats.max (capacity) enabled"]);
  });
  it("finds a limit that is not a non-negative safe integer", () => {
    for (const maximum of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      const bad: EntitlementCatalogue = { ...catalogue, plans: { ...catalogue.plans, pro: { ...catalogue.plans.pro, "seats.max": { kind: "limit", maximum } } } };
      expect(catalogueProblems(bad)).toEqual(["plan pro has an invalid limit for seats.max"]);
    }
  });
  it("finds a free plan or ladder entry that is not a plan, and a plan the ladder leaves out", () => {
    expect(catalogueProblems({ ...catalogue, freePlan: "nope" })).toEqual(["freePlan nope is not a plan"]);
    expect(catalogueProblems({ ...catalogue, ladder: ["free", "pro", "ghost"] })).toEqual(["ladder names ghost, which is not a plan", "ladder leaves out plan scale"]);
  });
  it("finds a catalogue version the policy does not read", () => {
    expect(catalogueProblems({ ...catalogue, version: 2 })).toEqual(["catalogue version 2 is not supported"]);
  });
});
