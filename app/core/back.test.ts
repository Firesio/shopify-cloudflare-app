import { describe, expect, it } from "vitest";
import { backOf } from "./back";

describe("backOf", () => {
  it("has no Back on the home page", () => {
    expect(backOf("/app")).toBeNull();
    expect(backOf("/app/")).toBeNull();
  });
  it("goes from a page of a section to the section's list", () => {
    expect(backOf("/app/support/new")).toBe("/app/support");
    expect(backOf("/app/support/abc123")).toBe("/app/support");
    expect(backOf("/app/members/m1")).toBe("/app/members");
  });
  it("goes home from a top-level page, including a section's own list", () => {
    expect(backOf("/app/plans")).toBe("/app");
    expect(backOf("/app/settings")).toBe("/app");
    expect(backOf("/app/support")).toBe("/app");
  });
});
