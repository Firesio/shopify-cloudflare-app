import { describe, expect, it } from "vitest";
import type { EntitlementCatalogue, SubscriptionSnapshot } from "~/domain/entitlement-policy";
import { MEMBER_SEATS_KEY } from "~/domain/member-seats";
import { createEntitlements } from "~/services/entitlements.server";
import { ENTITLEMENT_CATALOGUE } from "~/billing/entitlement-catalogue";
import { createMemberSeats } from "./member-seats.server";

const active = (planHandle = "free"): SubscriptionSnapshot => ({ status: "ACTIVE", planHandle, revision: 1 });

/** The real entitlement service over a catalogue and a plan, with no usage or capacity storage: only `check` is asked. */
function seatsFor(catalogue: EntitlementCatalogue, snapshot: SubscriptionSnapshot) {
  const service = createEntitlements({ subscriptions: { current: async () => snapshot }, catalogue });
  return createMemberSeats({ check: (shop, key) => service.check(shop, key) });
}

const catalogue = (grants: { free: EntitlementCatalogue["plans"][string][string]; pro: EntitlementCatalogue["plans"][string][string] } | null): EntitlementCatalogue => ({
  version: 1,
  freePlan: "free",
  features: grants ? { [MEMBER_SEATS_KEY]: { kind: "capacity" } } : { other: { kind: "capability" } },
  plans: grants
    ? { free: { [MEMBER_SEATS_KEY]: grants.free }, pro: { [MEMBER_SEATS_KEY]: grants.pro } }
    : { free: { other: { kind: "enabled" } }, pro: { other: { kind: "enabled" } } },
});

describe("the seat limit", () => {
  it("is the plan's maximum for a plan with a limit, and unlimited for one without", async () => {
    const grants = { free: { kind: "limit", maximum: 3 }, pro: { kind: "unlimited" } } as const;
    expect(await seatsFor(catalogue(grants), active("free")).limit("a.myshopify.com")).toEqual({ kind: "limit", maximum: 3 });
    expect(await seatsFor(catalogue(grants), active("pro")).limit("a.myshopify.com")).toEqual({ kind: "unlimited" });
  });

  it("is unlimited when the app never defined seats at all: it does not limit its team", async () => {
    expect(await seatsFor(catalogue(null), active()).limit("a.myshopify.com")).toEqual({ kind: "unlimited" });
  });

  it("gives no new seats on a plan that grants none", async () => {
    const grants = { free: { kind: "disabled" }, pro: { kind: "unlimited" } } as const;
    expect(await seatsFor(catalogue(grants), active("free")).limit("a.myshopify.com")).toEqual({ kind: "limit", maximum: 0 });
  });

  it("gives no new seats when the subscription is not active", async () => {
    const grants = { free: { kind: "unlimited" }, pro: { kind: "unlimited" } } as const;
    const frozen: SubscriptionSnapshot = { status: "FROZEN", planHandle: "pro", revision: 1 };
    expect(await seatsFor(catalogue(grants), frozen).limit("a.myshopify.com")).toEqual({ kind: "limit", maximum: 0 });
  });

  it("asks the entitlement for the members key and nothing else", async () => {
    const asked: string[] = [];
    const seats = createMemberSeats({
      check: async (_shop, key) => {
        asked.push(key);
        return { allowed: true, kind: "capacity" };
      },
    });
    await seats.limit("a.myshopify.com");
    expect(asked).toEqual(["members.max"]);
  });
});

describe("the template's own catalogue", () => {
  it("defines members.max as a capacity every plan grants, and limits no plan by default", () => {
    expect(ENTITLEMENT_CATALOGUE.features[MEMBER_SEATS_KEY]).toEqual({ kind: "capacity" });
    for (const plan of Object.values(ENTITLEMENT_CATALOGUE.plans)) expect(plan[MEMBER_SEATS_KEY]).toEqual({ kind: "unlimited" });
  });

  it("limits nobody on any shipped plan, through the real service", async () => {
    for (const planHandle of Object.keys(ENTITLEMENT_CATALOGUE.plans)) {
      expect(await seatsFor(ENTITLEMENT_CATALOGUE, active(planHandle)).limit("a.myshopify.com")).toEqual({ kind: "unlimited" });
    }
  });
});
