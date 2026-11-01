import { describe, expect, it } from "vitest";
import { MEMBER_STATUSES, MEMBER_TRANSITIONS, canTransition, isMemberStatus } from "./member-lifecycle";

describe("the lifecycle", () => {
  it("only moves to statuses that exist", () => {
    for (const status of MEMBER_STATUSES) {
      for (const target of MEMBER_TRANSITIONS[status]) expect(MEMBER_STATUSES).toContain(target);
    }
  });

  it.each([
    ["invited", "active", true],
    ["invited", "removed", true],
    ["invited", "pending", true],
    ["pending", "active", true],
    ["pending", "removed", true],
    ["active", "removed", true],
    ["active", "pending", false],
    ["active", "invited", false],
    ["removed", "active", true],
    ["removed", "pending", false],
  ] as const)("%s to %s is %s", (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it("never moves a status to itself", () => {
    for (const status of MEMBER_STATUSES) expect(canTransition(status, status)).toBe(false);
  });

  it("recognises exactly the declared statuses", () => {
    for (const status of MEMBER_STATUSES) expect(isMemberStatus(status)).toBe(true);
    for (const value of ["", "Active", "suspended", "__proto__"]) expect(isMemberStatus(value)).toBe(false);
  });
});
