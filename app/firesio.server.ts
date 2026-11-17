import { createFiresio } from "@firesio/app";
import { apiVersion } from "~/core/api-version";
import { identity } from "~/core/identity";
import { MEMBERS } from "~/core/members";
import { planCatalogue } from "~/core/plans";
import { SETTINGS } from "~/core/settings";
import { POLARIS_URL } from "~/core/polaris";
import * as schema from "~/db/schema";

/**
 * The app's plans (`core/plans.ts`) over the counts only this file can reach: the `tickets.max` meter of the plans page shows the
 * preset's own count of open tickets. The count names `firesio` before the line that builds it, which is safe: it runs when the
 * plans page asks, never while this module loads. Elsewhere the plans are `services.plans` and `services.catalogue`.
 */
export const PLANS = planCatalogue({ openTickets: (shop) => firesio.services().openTicketCount(shop) });

/**
 * The whole glue of the app (`docs/architecture.md` section 6.6, in the Firesio platform repo): the preset builds every service, the
 * guard, the Worker's handlers and the AdminApi from this one call, and each option below is something that DIFFERS from the
 * preset's default. Nothing here reads a binding: it is all built on first use, once per `env` object.
 */
export const firesio = createFiresio({
  identity: { name: identity.name, slug: identity.slug, logo: identity.logo },
  // The plans page (its cards, comparison rows and usage meters) is generated from this catalogue: there is nothing else to pass.
  plans: PLANS,
  members: MEMBERS,
  // The app's settings groups (`app/core/settings.ts`): `services.settings`, the page `routes/app/settings.tsx`.
  settings: [...SETTINGS],
  schema,
  // `support: { staffUrl: (ticketId) => ... }` is left unset: it would put the PORTAL's address of a ticket in the staff alert mail
  // (`STAFF_ALERT_EMAIL`), which says nothing without it (the merchant's embedded address is not one staff can open). The portal's page
  // is `<portal origin>/support/tickets/<this app's slug>/<ticketId>` (platform ticket 06); `docs/architecture.md` does not give the
  // pattern, so the template does not guess the portal's origin: set it when the app is registered with the portal.
  // One decision with `api_version` in both `shopify.app*.toml`, and one Polaris release for the preload header and `AppProvider`.
  shopify: { apiVersion, polarisUrl: POLARIS_URL },
});
