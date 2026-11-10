import { describe, expect, it } from "vitest";
import { fromMinorUnits, toCurrency } from "~/money";
import { unwrap } from "~/lib/result";
import { PHASE_TONE, planActionKind, statusLine, type PlanActionKind, type StatusLine } from "./billing-presentation";
import type { BillingStatus, SubscriptionPhase } from "./subscription-status";

const price = unwrap(fromMinorUnits(1900, unwrap(toCurrency("USD"))));
const PERIOD_END = Date.parse("2026-03-01T00:00:00.000Z");
const TRIAL_END = Date.parse("2026-02-01T00:00:00.000Z");

const subscribed = (over: Partial<Extract<BillingStatus, { kind: "subscribed" }>> = {}): BillingStatus => ({
  kind: "subscribed",
  phase: "active",
  name: "Pro",
  price,
  interval: "every_30_days",
  trialEndsAt: null,
  currentPeriodEndsAt: PERIOD_END,
  cancelsOn: null,
  ...over,
});

const PHASES: readonly SubscriptionPhase[] = ["active", "cancelling", "frozen", "pending", "cancelled", "inactive"];

describe("statusLine", () => {
  it("says nothing on the free plan", () => {
    expect(statusLine({ kind: "free" })).toBeNull();
  });

  it("states the renewal date and price for an active subscription", () => {
    expect(statusLine(subscribed())).toEqual({ kind: "renews", at: PERIOD_END, price });
  });

  it("states the renewal without a price when the price is unknown", () => {
    expect(statusLine(subscribed({ price: null }))).toEqual({ kind: "renews", at: PERIOD_END, price: null });
  });

  it("shows NO renewal line when the period end is unknown, instead of today's date", () => {
    expect(statusLine(subscribed({ currentPeriodEndsAt: null }))).toBeNull();
  });

  it("prefers the trial end over the renewal while a trial runs", () => {
    expect(statusLine(subscribed({ trialEndsAt: TRIAL_END }))).toEqual({ kind: "trial", endsAt: TRIAL_END, price });
  });

  it("a scheduled cancellation names the date it was given, as a UTC instant", () => {
    expect(statusLine(subscribed({ phase: "cancelling", cancelsOn: "2026-02-10" }))).toEqual({
      kind: "cancelsOn",
      instant: Date.parse("2026-02-10T00:00:00.000Z"),
    });
  });

  it("a scheduled cancellation with no date says it ends without inventing one", () => {
    expect(statusLine(subscribed({ phase: "cancelling", cancelsOn: null }))).toEqual({ kind: "cancelsAtPeriodEnd" });
    expect(statusLine(subscribed({ phase: "cancelling", cancelsOn: "garbage" }))).toEqual({ kind: "cancelsAtPeriodEnd" });
  });

  it.each<[SubscriptionPhase, StatusLine["kind"]]>([
    ["frozen", "frozen"],
    ["pending", "pending"],
    ["cancelled", "cancelled"],
    ["inactive", "inactive"],
  ])("the %s phase gets its own sentence and never a renewal", (phase, kind) => {
    expect(statusLine(subscribed({ phase, trialEndsAt: TRIAL_END }))).toEqual({ kind });
  });

  it("never emits a renewal or trial line for a phase that is not active", () => {
    for (const phase of PHASES.filter((p) => p !== "active")) {
      const line = statusLine(subscribed({ phase, trialEndsAt: TRIAL_END }));
      expect(line?.kind).not.toBe("renews");
      expect(line?.kind).not.toBe("trial");
    }
  });
});

describe("planActionKind", () => {
  it.each<[BillingStatus, PlanActionKind]>([
    [{ kind: "free" }, "upgrade"],
    [subscribed({ phase: "active" }), "manage"],
    [subscribed({ phase: "cancelling" }), "manage"],
    [subscribed({ phase: "frozen" }), "manage"],
    [subscribed({ phase: "pending" }), "review"],
    [subscribed({ phase: "cancelled" }), "resubscribe"],
    [subscribed({ phase: "inactive" }), "choose"],
  ])("%j -> %s", (status, expected) => {
    expect(planActionKind(status)).toBe(expected);
  });
});

describe("PHASE_TONE", () => {
  it("has a tone for every phase, and only the healthy one is green", () => {
    expect(Object.keys(PHASE_TONE).sort()).toEqual([...PHASES].sort());
    expect(PHASES.filter((phase) => PHASE_TONE[phase] === "success")).toEqual(["active"]);
  });
});
