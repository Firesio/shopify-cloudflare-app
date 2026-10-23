import { describe, expect, expectTypeOf, it } from "vitest";
import { createCapacityGate, createPlanGate, createQuotaGate } from "~/billing/gates";
import { createEntitlements } from "~/services/entitlements.server";
import { defineCatalogue, type EntitlementCatalogue } from "./entitlement-policy";

const catalogue = defineCatalogue({
  version: 1,
  freePlan: "free",
  features: { export: { kind: "capability" }, seats: { kind: "capacity" } },
  plans: {
    free: { export: { kind: "disabled" }, seats: { kind: "limit", maximum: 1 } },
    pro: { export: { kind: "enabled" }, seats: { kind: "unlimited" } },
  },
});

describe("defineCatalogue", () => {
  it("returns the catalogue it was given, unchanged", () => {
    expect(catalogue.features).toEqual({ export: { kind: "capability" }, seats: { kind: "capacity" } });
    expect(catalogue.plans.pro).toEqual({ export: { kind: "enabled" }, seats: { kind: "unlimited" } });
  });

  it("types the catalogue by the keys it defines", () => {
    expectTypeOf(catalogue).toEqualTypeOf<EntitlementCatalogue<"export" | "seats">>();
  });

  it("is still an ordinary catalogue wherever one is accepted", () => {
    expectTypeOf(catalogue).toExtend<EntitlementCatalogue>();
  });

  it("refuses, at compile time, a plan that leaves a feature without a grant", () => {
    const incomplete = () =>
      // @ts-expect-error the pro plan has no grant for `seats`
      defineCatalogue({ version: 1, freePlan: "free", features: { export: { kind: "capability" }, seats: { kind: "capacity" } }, plans: { free: { export: { kind: "disabled" }, seats: { kind: "limit", maximum: 1 } }, pro: { export: { kind: "enabled" } } } });
    expect(incomplete).toBeTypeOf("function");
  });
});

describe("a service built on a typed catalogue", () => {
  const service = createEntitlements({
    subscriptions: { current: async () => ({ status: "ACTIVE", planHandle: "pro", revision: 1 }) },
    catalogue,
    now: () => 0,
  });

  it("takes only the keys the catalogue defines", () => {
    expectTypeOf(service.check).parameter(1).toEqualTypeOf<"export" | "seats">();
    expectTypeOf(service.usage).parameter(1).toEqualTypeOf<"export" | "seats">();
    expectTypeOf(service.resolveMany).parameter(1).toEqualTypeOf<readonly ("export" | "seats")[]>();
  });

  it("refuses a misspelt key at compile time", () => {
    // @ts-expect-error "exprot" is not a key of this catalogue
    const misspelt = () => service.check("shop", "exprot");
    expect(misspelt).toBeTypeOf("function");
  });

  it("answers with the keys it was asked for", async () => {
    const answers = await service.resolveMany(["shop"], ["export", "seats"]);
    expectTypeOf(answers).toEqualTypeOf<ReadonlyMap<string, ReadonlyMap<"export" | "seats", Awaited<ReturnType<typeof service.check>>>>>();
    expect(answers.get("shop")?.get("export")).toEqual({ allowed: true, kind: "capability" });
  });

  it("keeps the untyped service as it was, for an app that passes a plain catalogue", async () => {
    const plainCatalogue: EntitlementCatalogue = { version: 1, freePlan: "free", features: { x: { kind: "capability" } }, plans: { free: { x: { kind: "enabled" } } } };
    const plain = createEntitlements({ subscriptions: { current: async () => ({ status: "ACTIVE", planHandle: "free", revision: 1 }) }, catalogue: plainCatalogue, now: () => 0 });
    expectTypeOf(plain.check).parameter(1).toEqualTypeOf<string>();
    expect(await plain.check("shop", "anything")).toEqual({ allowed: false, reason: "unknown_feature" });
  });
});

describe("gates built on a typed service", () => {
  const service = createEntitlements({
    subscriptions: { current: async () => ({ status: "ACTIVE", planHandle: "pro", revision: 1 }) },
    catalogue,
    now: () => 0,
  });

  it("take only the keys the catalogue defines", async () => {
    const exportGate = createPlanGate({ entitlements: service, key: "export" });
    expect(await exportGate.check("shop")).toEqual({ allowed: true, kind: "capability" });
    expectTypeOf(createQuotaGate<"export" | "seats">).parameter(0).toHaveProperty("key").toEqualTypeOf<"export" | "seats">();
    expectTypeOf(createCapacityGate<"export" | "seats">).parameter(0).toHaveProperty("key").toEqualTypeOf<"export" | "seats">();
    // @ts-expect-error "exprot" is not a key of this catalogue
    const misspelt = () => createPlanGate({ entitlements: service, key: "exprot" });
    expect(misspelt).toBeTypeOf("function");
  });
});

