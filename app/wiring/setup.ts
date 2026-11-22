import { defineSetup } from "@firesio/app/setup";
import type { AppServices } from "~/core/app-services";

/**
 * THE onboarding checklist the home page draws (`@firesio/app/setup`, `SetupChecklist`): a step is an id, a place to go and a check that says whether the
 * shop already did it. The words are the catalogue's, by key (`setup.steps.<id>.title|body|action` in `app/i18n/locales/<language>/app.json`).
 * A check may be slow (they run in parallel, each under a timeout) and one that fails counts as not done: the home page never breaks for it. A step can say
 * `requires: "<entitlement>"`: a shop whose plan lacks it sees the step locked and not counted. A check reads the app's own services (`AppServices`).
 *
 * TODO: replace these two examples with the app's own first steps (connect a printer, add a first product, ...).
 */
export const SETUP = defineSetup<AppServices>({
  steps: [
    { id: "save_settings", href: "/app/settings", done: (shop, services) => services.onboarding.settingsSaved(shop) },
    { id: "contact_support", href: "/app/support/new", done: (shop, services) => services.onboarding.contactedSupport(shop) },
  ],
});
