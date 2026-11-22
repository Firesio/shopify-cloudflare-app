import { env } from "cloudflare:workers";
import { createSettings } from "@firesio/app/settings";
import { d1SettingsStore } from "@firesio/app/settings/d1";
import { describe, expect, it } from "vitest";
import { GENERAL_SETTINGS, SETTINGS } from "~/core/settings";
import { setupTestDatabase } from "~/test/database";
import { onboardingFor } from "./onboarding";

setupTestDatabase();

const settings = () => createSettings({ store: d1SettingsStore(env.DB), now: () => 1_700_000_000_000 }, SETTINGS);

describe("what the onboarding checklist asks about a shop, against the real D1", () => {
  it("is done for the shop that saved its general settings, and for no other (a check never reads another shop's row)", async () => {
    const service = settings();
    await service.save("saved.myshopify.com", GENERAL_SETTINGS, { signature: "Hello" }, { actor: "member:1", allows: () => true });
    const onboarding = onboardingFor({ settings: service, support: null });
    expect(await onboarding.settingsSaved("saved.myshopify.com")).toBe(true);
    expect(await onboarding.settingsSaved("other.myshopify.com")).toBe(false);
  });

  it("counts a support ticket of the shop only", async () => {
    const asked: string[] = [];
    const support = { listRecentForShop: async (shop: string) => (asked.push(shop), shop === "wrote.myshopify.com" ? [{ id: "t1" }] : []) };
    const onboarding = onboardingFor({ settings: settings(), support });
    expect(await onboarding.contactedSupport("wrote.myshopify.com")).toBe(true);
    expect(await onboarding.contactedSupport("silent.myshopify.com")).toBe(false);
    expect(asked).toEqual(["wrote.myshopify.com", "silent.myshopify.com"]);
  });

  it("answers not done while support is off (no service to ask)", async () => {
    expect(await onboardingFor({ settings: settings(), support: null }).contactedSupport("any.myshopify.com")).toBe(false);
  });
});
