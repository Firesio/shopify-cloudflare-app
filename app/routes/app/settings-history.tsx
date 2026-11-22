import { firesio } from "~/firesio.server";

/** Who changed which setting, and when (`firesio_settings_audit`): the history of the general settings page, newest first. */
const history = firesio.settings.history({ permission: "app:manage", backPath: "/app/settings" });

export const loader = history.loader;
export { default } from "@firesio/app/ui/settings/history";
