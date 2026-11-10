import { describe, expect, it } from "vitest";
import { overageLimitFrom, seatCapOf, seatLimitFrom, seatReadingFrom, seatsLeft, trimmableLimitFrom, type SeatCheck, type SeatLimit } from "./member-seats";

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

describe("trimmableLimitFrom and overageLimitFrom: the strict reading used to take seats AWAY", () => {
  it("is the plan's maximum only for an allowed capacity with a whole-number maximum", () => {
    expect(trimmableLimitFrom({ allowed: true, kind: "capacity", maximum: 3 })).toBe(3);
    expect(trimmableLimitFrom({ allowed: true, kind: "capacity", maximum: 1 })).toBe(1);
    expect(overageLimitFrom({ allowed: true, kind: "capacity", maximum: 3 })).toEqual({ kind: "limit", maximum: 3 });
  });

  it("is never a number for a refusal, whatever the reason: a refusal is NOT a limit of zero, which would remove everyone", () => {
    const reasons = ["unknown_feature", "disabled", "inactive_subscription", "unknown_plan", "invalid_grant", "subscription_unavailable", "invalid_request", "anything-else", ""];
    for (const reason of reasons) {
      const refusal: SeatCheck = { allowed: false, reason };
      expect(trimmableLimitFrom(refusal), reason).toBeNull();
      expect(overageLimitFrom(refusal), reason).toEqual({ kind: "unknown" });
      // The permissive reader that decides who may JOIN does turn a refusal into zero: that is exactly why it must not be used here.
      if (reason !== "unknown_feature") expect(seatLimitFrom(refusal)).toEqual({ kind: "limit", maximum: 0 });
    }
  });

  it("is unlimited, and not a number, for a capacity with no maximum: there is nothing to enforce", () => {
    expect(trimmableLimitFrom({ allowed: true, kind: "capacity" })).toBeNull();
    expect(overageLimitFrom({ allowed: true, kind: "capacity" })).toEqual({ kind: "unlimited" });
  });

  it.each(["capability", "quota"] as const)("does not trust a key defined as a %s", (kind) => {
    expect(trimmableLimitFrom({ allowed: true, kind })).toBeNull();
    expect(overageLimitFrom({ allowed: true, kind })).toEqual({ kind: "unknown" });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2])("reads a maximum of %s as unreadable, never as a limit: a team always holds its owner", (maximum) => {
    expect(trimmableLimitFrom({ allowed: true, kind: "capacity", maximum })).toBeNull();
    expect(overageLimitFrom({ allowed: true, kind: "capacity", maximum })).toEqual({ kind: "unknown" });
  });
});

describe("seatReadingFrom (what the page may say)", () => {
  it("is the maximum of a capacity, including a real 0, and unlimited without one", () => {
    expect(seatReadingFrom({ allowed: true, kind: "capacity", maximum: 3 })).toEqual({ kind: "limit", maximum: 3 });
    expect(seatReadingFrom({ allowed: true, kind: "capacity", maximum: 0 })).toEqual({ kind: "limit", maximum: 0 });
    expect(seatReadingFrom({ allowed: true, kind: "capacity" })).toEqual({ kind: "unlimited" });
  });

  it("is unlimited when the app never defined seats, and a limit of 0 on a plan that grants none", () => {
    expect(seatReadingFrom({ allowed: false, reason: "unknown_feature" })).toEqual({ kind: "unlimited" });
    expect(seatReadingFrom({ allowed: false, reason: "disabled" })).toEqual({ kind: "limit", maximum: 0 });
  });

  it.each(["inactive_subscription", "unknown_plan", "invalid_grant", "subscription_unavailable", "anything-else"])("is unknown, not a limit of 0, when the plan refuses for %s", (reason) => {
    expect(seatReadingFrom({ allowed: false, reason })).toEqual({ kind: "unknown" });
  });

  it.each(["capability", "quota"] as const)("is unknown for a key defined as a %s", (kind) => {
    expect(seatReadingFrom({ allowed: true, kind })).toEqual({ kind: "unknown" });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("is unknown for a maximum that is not a whole number of seats (%s)", (maximum) => {
    expect(seatReadingFrom({ allowed: true, kind: "capacity", maximum })).toEqual({ kind: "unknown" });
  });

  it("does not change what admission reads: a refusal is still no new seat", () => {
    expect(seatLimitFrom({ allowed: false, reason: "inactive_subscription" })).toEqual({ kind: "limit", maximum: 0 });
  });
});
