import { notifyKit } from "@firesio/app/notify";
import type { AppServices } from "~/core/app-services";

/**
 * `defineMessage` and `defineNotify` typed with the app's own services (`AppServices`, `app/core/app-services.ts`) and the Worker's `Env` (what `streams` is handed): a content function of a message, the layout's
 * `load` and every hook (`resolve`, `guard`, `on`) read `services` typed. The package's services are not in this type on purpose: they would make the composition file's
 * type circular; a hook that needs a package service reads it through an app service built in `app/wiring/` (handed what it uses).
 */
export const kit = notifyKit<AppServices, Env>();
