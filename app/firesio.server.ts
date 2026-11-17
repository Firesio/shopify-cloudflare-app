import { createFiresio } from "@firesio/app";
import { apiVersion } from "~/core/api-version";
import { identity } from "~/core/identity";
import { MEMBERS } from "~/core/members";
import { PLANS } from "~/core/plans";
import { SETTINGS } from "~/core/settings";
import { POLARIS_URL } from "~/core/polaris";
import * as schema from "~/db/schema";
import { ENTITLEMENT_LABELS } from "~/i18n/labels";

/**
 * The whole glue of the app (`docs/architecture.md` section 6.6, in the Firesio platform repo): the preset builds every service, the
 * guard, the Worker's handlers and the AdminApi from this one call, and each option below is something that DIFFERS from the
 * preset's default. Nothing here reads a binding: it is all built on first use, once per `env` object.
 */
export const firesio = createFiresio({
  identity: { name: identity.name, slug: identity.slug, logo: identity.logo },
  plans: PLANS,
  members: MEMBERS,
  // The app's settings groups (`app/core/settings.ts`): `services.settings`, the page `routes/app/settings.tsx`.
  settings: [...SETTINGS],
  schema,
  // The plans page's names for the entitlement keys of `core/plans.ts`. The meter of `tickets.max` is the preset's own; an
  // entitlement of yours that is a counter gets a `meters` entry here, and only once your code consumes that counter
  // (`services.usage.consume`): a meter nothing increments shows 0 forever.
  labels: { entitlements: ENTITLEMENT_LABELS },
  // `support: { staffUrl: (ticketId) => ... }` is left unset: it would put the PORTAL's address of a ticket in the staff alert mail
  // (`STAFF_ALERT_EMAIL`), which says nothing without it (the merchant's embedded address is not one staff can open). The portal's page
  // is `<portal origin>/support/tickets/<this app's slug>/<ticketId>` (platform ticket 06); `docs/architecture.md` does not give the
  // pattern, so the template does not guess the portal's origin: set it when the app is registered with the portal.
  // One decision with `api_version` in both `shopify.app*.toml`, and one Polaris release for the preload header and `AppProvider`.
  shopify: { apiVersion, polarisUrl: POLARIS_URL },
});
