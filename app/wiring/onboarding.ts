import type { SettingsService } from "@firesio/app/settings";
import type { Onboarding } from "~/core/app-services";
import { GENERAL_SETTINGS } from "~/core/settings";

/** The part of the preset's services the onboarding reads: handed to `onboardingFor` by the composition file, never the whole bag. */
export interface OnboardingDeps {
  readonly settings: Pick<SettingsService, "view">;
  readonly support: { listRecentForShop(shop: string, limit: number): Promise<readonly unknown[]> } | null;
}

/** What the checklist's checks read, bound to the services they use (a check is a question about one shop; it never writes). */
export function onboardingFor({ settings, support }: OnboardingDeps): Onboarding {
  return {
    // Revision 0 is "never saved": the first save makes it 1.
    settingsSaved: async (shop) => (await settings.view(shop, GENERAL_SETTINGS)).revision > 0,
    contactedSupport: async (shop) => ((await support?.listRecentForShop(shop, 1)) ?? []).length > 0,
  };
}
