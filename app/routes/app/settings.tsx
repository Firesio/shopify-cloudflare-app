import { GENERAL_SETTINGS } from "~/core/settings";
import { firesio } from "~/firesio.server";

/**
 * The general settings: a loader, an action and a page, from ONE call. `firesio.settings.route(group, ...)` reads the group, checks the permission
 * (403 without it, read-only without `write`), refuses a save per field, keeps the audit (`/app/settings/history`) and words the page from the
 * catalogue (`settings.general.*` in `app/i18n/locales`). The page itself is the package's, drawn from the group's schema.
 */
const general = firesio.settings.route(GENERAL_SETTINGS, { permission: "app:manage", historyPath: "/app/settings/history" });

export const loader = general.loader;
export const action = general.action;
export { default } from "@firesio/app/ui/settings/page";
