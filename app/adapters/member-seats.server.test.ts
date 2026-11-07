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

describe("the limit for taking a seat away", () => {
  const overage = (grants: Parameters<typeof catalogue>[0], snapshot: SubscriptionSnapshot, forget?: (shop: string) => void) => {
    const service = createEntitlements({ subscriptions: { current: async () => snapshot }, catalogue: catalogue(grants) });
    return createMemberSeats({ check: (shop, key) => service.check(shop, key) }, forget ? { forget } : {});
  };

  it("is the plan's maximum for a plan with a limit, and unlimited for one without", async () => {
    const grants = { free: { kind: "limit", maximum: 3 }, pro: { kind: "unlimited" } } as const;
    expect(await overage(grants, active("free")).overageLimit("a.myshopify.com")).toEqual({ kind: "limit", maximum: 3 });
    expect(await overage(grants, active("pro")).overageLimit("a.myshopify.com")).toEqual({ kind: "unlimited" });
  });

  it("is UNKNOWN, never a limit of zero, when the plan refuses: a plan that grants none, an inactive subscription, an unknown plan, an app that defines no seats", async () => {
    const grants = { free: { kind: "disabled" }, pro: { kind: "limit", maximum: 2 } } as const;
    const frozen: SubscriptionSnapshot = { status: "FROZEN", planHandle: "pro", revision: 1 };
    const unobserved: SubscriptionSnapshot = { status: "UNKNOWN", planHandle: null, revision: 0 };
    const unlisted: SubscriptionSnapshot = { status: "ACTIVE", planHandle: "enterprise", revision: 1 };
    expect(await overage(grants, active("free")).overageLimit("a.myshopify.com")).toEqual({ kind: "unknown" });
    expect(await overage(grants, frozen).overageLimit("a.myshopify.com")).toEqual({ kind: "unknown" });
    expect(await overage(grants, unobserved).overageLimit("a.myshopify.com")).toEqual({ kind: "unknown" });
    expect(await overage(grants, unlisted).overageLimit("a.myshopify.com")).toEqual({ kind: "unknown" });
    expect(await overage(null, active()).overageLimit("a.myshopify.com")).toEqual({ kind: "unknown" });
    // The permissive reader, which decides who may join, reads the same refusals as "no new seats".
    expect(await overage(grants, active("free")).limit("a.myshopify.com")).toEqual({ kind: "limit", maximum: 0 });
  });

  it("drops what the request remembered about the shop's plan first, so it never trusts a read taken earlier", async () => {
    const order: string[] = [];
    const seats = createMemberSeats(
      { check: async () => { order.push("check"); return { allowed: true, kind: "capacity", maximum: 2 }; } },
      { forget: (shop) => order.push(`forget:${shop}`) },
    );
    await seats.overageLimit("a.myshopify.com");
    await seats.limit("a.myshopify.com");
    // `limit`, which lets people in, may use the memo; only the seat-taking read forgets.
    expect(order).toEqual(["forget:a.myshopify.com", "check", "check"]);
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
