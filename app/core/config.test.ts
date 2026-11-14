import { checkOf } from "@firesio/members";
import type { NotificationCatalogue } from "@firesio/notify";
import { entitlementOf } from "@firesio/plans";
import { assertTranslationsComplete } from "@firesio/content";
import { describe, expect, it } from "vitest";
import { seatCheckOf } from "~/wiring/members";
import { CONTENT, FALLBACK_LOCALE, TRANSLATIONS } from "./content";
import { identity } from "./identity";
import { MEMBERS } from "./members";
import { NOTIFICATIONS } from "./notifications";
import { PLANS } from "./plans";

describe("the app's own declarations", () => {
  it("has a members configuration where the owner and the admin hold everything and a stranger never gets the plan", () => {
    expect(MEMBERS.presets.get("owner")).toEqual(MEMBERS.permissions);
    expect(MEMBERS.presets.get("admin")).toEqual(MEMBERS.permissions);
    expect(MEMBERS.presets.get(MEMBERS.autoJoinRole)).not.toContain("billing:manage");
    expect(MEMBERS.notForStrangers).toContain("billing:manage");
    expect(MEMBERS.autoJoinRole).not.toBe(MEMBERS.ownerRole);
  });

  it("has every text in the fallback language, with the placeholders it declares", () => {
    expect(() => assertTranslationsComplete(CONTENT, TRANSLATIONS, { defaultLocale: FALLBACK_LOCALE })).not.toThrow();
  });

  it("names a content key for every notification type", () => {
    const catalogue: NotificationCatalogue = NOTIFICATIONS;
    for (const spec of Object.values(catalogue)) {
      const keys = typeof spec.content === "string" ? [spec.content] : Object.values(spec.content);
      for (const key of keys) expect(Object.keys(CONTENT)).toContain(key);
    }
  });

  it("starts the plan table with the free plan (the one a shop with no subscription is served)", () => {
    expect(Object.keys(PLANS)[0]).toBe("free");
    expect(PLANS.free.monthly.amount).toBe(0);
  });

  it("uses a slug the contract accepts as our own app name", () => {
    expect(identity.slug).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

describe("the seat limit read from the plan", () => {
  it("is the plan's members.max: a number, no limit, or not in the plan", () => {
    expect(seatCheckOf("free")).toEqual(checkOf(null));
    expect(entitlementOf(PLANS, "free", "members.max")).toEqual({ kind: "unlimited" });
  });
});
