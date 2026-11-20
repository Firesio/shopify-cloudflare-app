import { createFiresio } from "@firesio/app";
import { apiVersion } from "~/core/api-version";
import { identity } from "~/core/identity";
import { MEMBERS } from "~/core/members";
import { SUPPORT_UPLOAD_PATH } from "~/core/paths";
import { PLANS } from "~/core/plans";
import { UNASSIGNED_CONVERSATION_DAYS } from "~/core/retention";
import { SETTINGS } from "~/core/settings";
import { POLARIS_URL } from "~/core/polaris";
import * as schema from "~/db/schema";

/**
 * The whole glue of the app (`docs/architecture.md` section 6.6, in the Firesio platform repo): the preset builds every service, the
 * guard, the Worker's handlers and the AdminApi from this one call, and each option below is something that DIFFERS from the
 * preset's default. Nothing here reads a binding: it is all built on first use, once per `env` object.
 */
export const firesio = createFiresio({
  identity: { name: identity.name, slug: identity.slug, logo: identity.logo },
  // The plans page (its cards, comparison rows and usage meters) is generated from the catalogue of `core/plans.ts`. A count that
  // reads the database is given here, beside the services: the `tickets.max` meter shows the preset's own count of open tickets.
  plans: PLANS,
  counts: (services) => ({ "tickets.max": (shop) => services.openTicketCount(shop) }),
  members: MEMBERS,
  // The app's settings groups (`app/core/settings.ts`): `services.settings`, the page `routes/app/settings.tsx`.
  settings: [...SETTINGS],
  schema,
  // `support: { staffUrl: (ticketId) => ... }` is left unset: it would put the PORTAL's address of a ticket in the staff alert mail
  // (`STAFF_ALERT_EMAIL`), which says nothing without it (the merchant's embedded address is not one staff can open). The portal's page
  // is `<portal origin>/support/tickets/<this app's slug>/<ticketId>` (platform ticket 06); `docs/architecture.md` does not give the
  // pattern, so the template does not guess the portal's origin: set it when the app is registered with the portal.
  // A support conversation NO shop owns (a stranger's mail, the public form) is erased a year after its last activity
  // (`core/retention.ts`): the package keeps it for ever unless the app decides, and a stranger's words need a limit the policy states.
  retention: { unassignedConversationDays: UNASSIGNED_CONVERSATION_DAYS },
  // The support pages' file picker streams each file to the staging route mounted there (`app/routes.ts`); without it they take no files.
  paths: { supportUpload: SUPPORT_UPLOAD_PATH },
  // Serves the Shopify POS webview with the same pages: the request's surface is read (`from(context).surface`), `routes/app/surface.ts` receives
  // the page's own report. Costs nothing on the web admin. `[pos] embedded = true` in `shopify.app.toml` is what lists the app in POS.
  surface: {},
  // Staff announcements the portal writes and this app emails to its own merchants (the `campaigns()` group of the contract). Needs the tables
  // (`drizzle.config.ts`), the `<slug>-campaigns` queue and its dead-letter queue (`wrangler.jsonc`), `EMAIL`/`EMAIL_FROM` on a verified Email Sending
  // domain, `ATTACHMENT_TOKEN_SECRET`, and the public unsubscribe route (`routes/campaigns/unsubscribe.ts`). Options: `segments`, `signature`,
  // `options`, `unsubscribePath`. The portal asks only an app that declares `campaigns: true` in its `declared-apps.ts`.
  campaignDelivery: {},
  // One decision with `api_version` in both `shopify.app*.toml`, and one Polaris release for the preload header and `AppProvider`.
  shopify: { apiVersion, polarisUrl: POLARIS_URL },
});
