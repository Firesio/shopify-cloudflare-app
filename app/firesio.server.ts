import { createFiresio } from "@firesio/app";
import { cloudflareAi } from "@firesio/app/ai/cloudflare";
import { packageFlows } from "@firesio/app/preset/flows";
import { SUPPORT_UPLOAD_PATH } from "@firesio/app/shell";
import { appLinksFor, type AppServices } from "~/core/app-services";
import { PWA } from "~/core/features";
import { identity } from "~/core/identity";
import { MEMBERS } from "~/core/members";
import { PHONE_DEVICES } from "~/core/phone";
import { PLANS } from "~/core/plans";
import { UNASSIGNED_CONVERSATION_DAYS } from "~/core/retention";
import { SETTINGS } from "~/core/settings";
import { POLARIS_URL } from "~/core/polaris";
import * as schema from "~/db/schema";
import { CATALOGUE, FALLBACK_LANGUAGE } from "~/i18n";
import { notifications } from "~/notifications";
import { sendWelcome } from "~/notifications/welcome";
import { JOBS } from "~/wiring/jobs";
import { onboardingFor } from "~/wiring/onboarding";
import { SETUP } from "~/wiring/setup";
import { staffTools } from "~/wiring/staff-tools";

/**
 * The whole glue of the app (`docs/architecture.md` section 6.6, in the Firesio platform repo): the preset builds every service, the
 * guard, the Worker's handlers and the AdminApi from this one call, and each option below is something that DIFFERS from the
 * preset's default. Nothing here reads a binding: it is all built on first use, once per `env` object. `Env` is what `wrangler types` generates
 * (`worker-configuration.d.ts`): `services.env` and `firesio.context.current().env` are `Env` typed.
 */
export const firesio = createFiresio<Env>()({
  identity: { name: identity.name, slug: identity.slug, logo: identity.logo },
  // The app's own services, built ONCE here and handed to EVERY entry point (a route, a job, an event handler, a cron step, a queue consumer, a flow, an
  // AdminApi command) beside the package's: `services.links.openAppUrl(shop)`, `services.onboarding`. `shop` is null for the system's work. Written before the options that use it.
  services: ({ env, services }): AppServices => ({ links: appLinksFor(env.SHOPIFY_APP_URL), onboarding: onboardingFor(services) }),
  // The plans page (its cards, comparison rows and usage meters) is generated from the catalogue of `core/plans.ts`. A count that
  // reads the database is given here, beside the services: the `tickets.max` meter shows the preset's own count of open tickets.
  plans: PLANS,
  counts: (services) => ({ "tickets.max": (shop) => services.openTicketCount(shop) }),
  members: MEMBERS,
  // The app's settings groups (`app/core/settings.ts`): `services.settings`, the page `routes/app/settings.tsx` (`firesio.settings.route`) and its history.
  settings: [...SETTINGS],
  // The onboarding checklist of the home page (its words are the catalogue's `setup.steps.<id>.*`): `firesio.setup.view(args)` and `firesio.setup.action(args)`, the table `firesio_setup`.
  setup: SETUP,
  schema,
  // The app's mail (`app/notifications`): a layout in React Email, the sample welcome message and the hook examples. The preset adds the senders `app` (Cloudflare
  // Email over `EMAIL`, from `EMAIL_FROM`) and `support`, the stores, the queue and the package's own messages, so a clone sends mail with no more configuration.
  notify: notifications,
  // The app's words, for the pages and the mail alike (`app/i18n/locales/<language>/app.json`): the languages ARE the folders.
  i18n: { catalogue: CATALOGUE, fallback: FALLBACK_LANGUAGE },
  // Workers AI: the support spam check (a stranger's mail opens a conversation unless a model reads it as spam) and any feature the app adds (`.claude/rules/ai.md`).
  // AI is opt-in by import: without this line the app has none and the spam check is off.
  ai: cloudflareAi(),
  // A support conversation NO shop owns (a stranger's mail, the public form) is erased a year after its last activity
  // (`core/retention.ts`): the package keeps it for ever unless the app decides, and a stranger's words need a limit the policy states.
  retention: { unassignedConversationDays: UNASSIGNED_CONVERSATION_DAYS },
  // The support pages' file picker streams each file to the staging route mounted there (`app/routes.ts`); without it they take no files.
  paths: { supportUpload: SUPPORT_UPLOAD_PATH },
  // Serves the Shopify POS webview with the same pages: the request's surface is read (`from(context).surface`), `routes/app/surface.ts` receives
  // the page's own report. Costs nothing on the web admin. `[pos] embedded = true` in `shopify.app.toml` is what lists the app in POS.
  surface: {},
  // The staff phone app, while its switch is on (`app/core/features.ts`): the device gate in the admin middleware, `firesio.devices()`, the daily sweep. Needs the three
  // tables of `devices/d1` (migrations, always present), `DEVICE_LINK_LIMITER` (always declared) and the routes `routes.ts` mounts under the same switch.
  ...(PWA ? { devices: PHONE_DEVICES } : {}),
  // What the portal draws for the team and turns into MCP tools (`app/wiring/staff-tools.ts`: one resource, one action as the example). The portal asks only
  // an app that declares `staffTools: true` in its `declared-apps.ts`.
  staffTools: (define) => staffTools(define),
  // The app's background work: jobs (`app/wiring/jobs.ts`, none yet) and flows (multi-step processes that wait: `defineFlow` of `@firesio/app/flows`, listed here
  // beside `packageFlows`, the package's own the app runs: `gdprExport`, `d1Export`, `resendDomain`, `backfills`. The template needs none of them).
  jobs: JOBS,
  flows: packageFlows({}),
  // What the app hears, ONE typed map (`installed`, `reinstalled`, `uninstalled`, `planChanged`, `redacted`, `shopSynced`, `memberJoined`, ...). Each handler runs as a
  // JOB: at least once, retried with backoff, a dead letter when it gives up; dedupe on `event.eventId`. The example welcomes the shop by mail.
  on: {
    installed: ({ shop }, services) => sendWelcome(services, shop),
  },
  // Campaigns (`campaignDelivery: { sender: "broadcast" }`) are off: they are mail on consent, which Cloudflare Email cannot carry. Turn them on with a sender that
  // accepts consent (`resend()` of `@firesio/app/notify/providers`) declared in `app/notifications/index.ts`, the `campaigns` queue-free flow needs the FLOWS binding
  // (declared), and the portal declares `campaigns: true`. The tables stay in the migrations, so switching them on needs no migration.
  // The Admin API version is the package's default (`ADMIN_API_VERSION` of `@firesio/app/shell`, "2026-10"): ONE decision with `api_version` in both `shopify.app*.toml`, held by
  // `npm run check:placeholders`. Pass `shopify: { apiVersion }` only to choose another. One Polaris release for the preload header and `AppProvider`.
  shopify: { polarisUrl: POLARIS_URL },
});
