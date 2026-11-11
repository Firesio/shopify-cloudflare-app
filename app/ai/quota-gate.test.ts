import { describe, expect, it } from "vitest";
import { dailyCallCap } from "./quota-gate";
import type { ModelRole } from "./roles";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function gateWith(calls: number) {
  const asked: { role: ModelRole; since: number }[] = [];
  const gate = dailyCallCap({
    role: "classification",
    perDay: 3,
    callsSince: async (role, since) => {
      asked.push({ role, since });
      return calls;
    },
    now: () => NOW,
  });
  return { gate, asked };
}

const caller = { surface: "system", shop: null } as const;

describe("the daily call cap", () => {
  it("allows a call while the purpose is under its cap", async () => {
    expect(await gateWith(2).gate.refuse({ caller, role: "classification" })).toBeNull();
  });

  it("refuses at the cap, as rate limited", async () => {
    expect(await gateWith(3).gate.refuse({ caller, role: "classification" })).toBe("rate_limited");
  });

  it("counts a rolling 24 hours, not a calendar day", async () => {
    const { gate, asked } = gateWith(0);
    await gate.refuse({ caller, role: "classification" });
    expect(asked).toEqual([{ role: "classification", since: NOW - DAY }]);
  });

  it("leaves every other purpose alone, without even counting", async () => {
    const { gate, asked } = gateWith(1_000);
    expect(await gate.refuse({ caller, role: "writing" })).toBeNull();
    expect(asked).toEqual([]);
  });
});
