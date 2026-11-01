import { describe, expect, it } from "vitest";
import { seatCapOf, seatLimitFrom, seatsLeft, type SeatLimit } from "./member-seats";

describe("seatLimitFrom", () => {
  it("is the plan's maximum for a capacity with one", () => {
    expect(seatLimitFrom({ allowed: true, kind: "capacity", maximum: 3 })).toEqual({ kind: "limit", maximum: 3 });
    expect(seatLimitFrom({ allowed: true, kind: "capacity", maximum: 0 })).toEqual({ kind: "limit", maximum: 0 });
  });

  it("is unlimited for a capacity with none", () => {
    expect(seatLimitFrom({ allowed: true, kind: "capacity" })).toEqual({ kind: "unlimited" });
  });

  it("is unlimited when the app never defined seats: it does not limit its team", () => {
    expect(seatLimitFrom({ allowed: false, reason: "unknown_feature" })).toEqual({ kind: "unlimited" });
  });

  it.each(["disabled", "inactive_subscription", "unknown_plan", "invalid_grant", "subscription_unavailable", "anything-else"])(
    "gives no new seats when the entitlement refuses for %s",
    (reason) => {
      expect(seatLimitFrom({ allowed: false, reason })).toEqual({ kind: "limit", maximum: 0 });
    },
  );

  it.each(["capability", "quota"] as const)("gives no new seats when the key was defined as a %s: a misdefined catalogue is noticed", (kind) => {
    expect(seatLimitFrom({ allowed: true, kind })).toEqual({ kind: "limit", maximum: 0 });
  });
});

describe("seatCapOf and seatsLeft", () => {
  const limit = (maximum: number): SeatLimit => ({ kind: "limit", maximum });

  it("has no cap for an unlimited plan and the maximum otherwise", () => {
    expect(seatCapOf({ kind: "unlimited" })).toBeNull();
    expect(seatCapOf(limit(5))).toBe(5);
    expect(seatCapOf(limit(0))).toBe(0);
  });

  it("counts the seats left, and none below zero when the plan was downgraded under the team", () => {
    expect(seatsLeft(limit(5), 2)).toBe(3);
    expect(seatsLeft(limit(5), 5)).toBe(0);
    expect(seatsLeft(limit(2), 7)).toBe(0);
    expect(seatsLeft({ kind: "unlimited" }, 7)).toBeNull();
  });
});
