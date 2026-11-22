# Migrating an app from `@firesio/app` 1.x to 2.0

For the owners of the apps that were built on the template or on the package before 2.0 (repair, team-up, VIP) and for anyone taking the template's `template-v2.0.0` tag. The package's own
upgrade guide is the top entry of its `CHANGELOG.md` (the installed package carries it at `node_modules/@firesio/app/CHANGELOG.md`): this page is the same changeset as an ordered checklist, with
what this template did for each step so you can copy it. 2.0.0 is breaking on purpose and **removes what it replaces**: nothing is kept deprecated, aliased or optional beside the new form.

Work on a branch, one step at a time, and run `npm run verify` after each group of steps. The order matters: the code first (steps 1 to 5), then the configuration and the migration (6 to 8),
then what you run before and after deploying (9 and 10).

## 1. Install

```bash
# a token in the command's environment only; never in .npmrc (the repo's .npmrc maps the scope to GitHub Packages with ${NPM_TOKEN})
NPM_TOKEN=<read:packages token> npm install @firesio/app@^2.1.1 @firesio/portal-contract@^1.3.0 @react-email/components @react-email/render
```

- `@firesio/portal-contract` must be `>=1.3.0 <2.0.0` (the peer range). `@react-email/components` and `@react-email/render` are optional peers the preset's mail renderer imports: every app installs them.
- `ai` and `agents` stay only if the app uses AI (step 4). `wrangler` must be 4.158 or later (the Durable Object `retryable()` the coordinator uses is typed from there; the template is on 4.166) and
  `@cloudflare/vitest-plugin` 1.9 or later (an older one bundles a `workerd` that rejects the shared `compatibility_date`). Take `@firesio/app` 2.1.1 or later.
- `npx wrangler types` after the config change of step 6, so `Env` knows the new bindings.

## 2. Remove what the package replaced

Delete, do not wrap:

- `withServices`, `around`, `lifecycle` (`onInstall`, `afterInstall`, `onUninstalled`, `on.*`), `onWebhookDeadLetter`, `onWebhookDiscarded`, `cron.onStepFailed`, `lapsed` (it is `fallback`),
  `webhookQueues`, `webhookDeadLetterQueues`, `notify.queues`, `campaignDelivery.queues`, `services.adminFor` (use `services.shopify.admin(shop)`), `AppWebhookServices` (it is `HandlerServices`),
  `RevokingMemberStore`, `SeatHooks`, `support.routeMail`, `support.onTicketCreated` (it is `support.on.opened`), `support.staffUrl`, `STAFF_ALERT_EMAIL`, `alertStaff`, `retention.notificationLogDays`
  (it is `mailLogDays`), `createFiresio({ support: { labels } })`.
- Your own `AsyncLocalStorage` and `getEnv()`: the package opens `firesio.context` (`firesio.context.current().env`, `services.env`).
- The old notify code: `defineMessages`, `message`, `createNotifier`, `createMessenger`, `can`, `look`, `copies`, `mailCopies`, `textsFor`, the email blocks, `notify/email`, `notify/delivery`, `ui/notifications`
  (the preferences page; a merchant's switch for a message is `shouldSend` over data the app keeps), `services.notifier`, `NotificationCatalogue`, `ShopLook`.
- Every `xLabelsFor(locale)`, `spanishXLabels`, `germanXLabels`, `englishXExtras`, the `translations/` folders, `inLanguage`: the words are the catalogue's (step 3). Placeholders are `{{x}}`, never `{x}` or ICU plurals.
- The AI model catalogue and `AiService`, `defineAiTask` and friends, `createFiresio({ ai: { client } })`, the `ai_*` tables' readers (step 4).
- The campaigns' self-scheduling chain, watchdog, `CAMPAIGNS_QUEUE` (producer, consumer and DLQ), `firesio.campaigns()`, the library's own unsubscribe page and `campaign_unsubscribes`; texting's outbox, dispatcher,
  `meter`, `compliance`, `requireOptIn`, `messageSpec`; the `STAFF_DIRECTORY` binding; the old shell copies (`app/core/render-error.ts`, `install-target.ts`, `response-headers.ts`, `api-version.ts` are the
  package's `@firesio/app/shell` now; this template still carries its copies and moves to it in a later tag).
- The helpers kept "so the API only adds": `isOk`, `mapResult`, `unwrapOr`, `percentChange`, `parseJsonBody`, `onPromiseSettled` (write `void promise.then(done, done)`), `TICKET_METRICS` (use `SUPPORT_METRICS` of the contract),
  the staff-directory reader, `listForShop`, `listOpenForStaff`, `Billing.refresh`, `memorySubscriptionStore`.
- Renames: `AdminError.code` is `.kind` (lower case); `toPlanHandle` and friends are `planForShopify(plans, handle)` / `currentPlanAt(...)`; `AppServicesFactory` is `ServicesFactory`; `cron.preset` name
  `subscriptions_refresh` is `subscriptions_sweep`; `Notify.unsuppress` takes the `reason` it lifts; `AiCaller` has a `kind` (not a `surface`), `firesio.job({ shop, kind })`; `localeOf` is gone (`localeIn(i18n)(request)`).

## 3. The composition file, the Worker entry and the words

`app/firesio.server.ts` becomes ONE call: `createFiresio<Env>()({ ... })` (`Env` is what `wrangler types` generates). What the template does, in this order of the object:

1. **`services`** (FIRST: `ServicesMustComeFirst` refuses a `services` written after an option that uses it): the app's own services in ONE factory, `({ shop, services, env }): AppServices => ({ ... })`, handed to a route, a job, an event handler, a cron step, a queue consumer, a flow and an AdminApi
   command alike. Type it as `AppServices` (`app/core/app-services.ts`) and type every option that names the services with it (`notifyKit<AppServices>()`, `defineSetup<AppServices>`): TypeScript infers the factory's
   result from every option that mentions the services, so a hook typed with another bag makes the whole call infer `object`. A check that needs a package service reads it through an app service built in
   `app/wiring/` (the template's `onboardingFor({ settings, support })`).
2. **`on`**: ONE typed map of events (`installed`, `reinstalled`, `uninstalled`, `planChanged`, `redacted`, `shopSynced`, `memberJoined`, `memberRemoved`, `roleChanged`, `seatsOverLimit`, `seatsSuspended`,
   `seatsRestored`, `webhookDeadLetter`, `jobDeadLetter`, `jobFailed`). Each handler is a job (at least once, a stable `eventId`, retried, a dead letter). There is no `onInstall` awaited before the page and
   no `afterInstall`: do what the first page needs in its own loader. The install events never run on the hourly renewal of a token. The template's `installed` handler sends the welcome mail.
3. **`notify`**: `defineNotify` in `app/notifications/` (step 5). **`i18n: { catalogue, fallback }`**: the words (below).
4. **`members`** in the small shape (`defineMembers({ permissions, roles, join, joinRole, customPermissions, seatGraceHours })`): `owner`, `admin`, `app:view`, `members:manage`, `billing:manage` are built in;
   `ownerRole`, `firstUserRole`, `managePermission`, `floorPermission`, `notForStrangers`, `lowestRole`, `unknownRole`, `onlineTokens`, `seatOverage`, `autoJoinRole`, `onUnknownUser` and
   `customPermissions.alsoProtected` are gone (they were the same five values in every app). Seats run as a flow (`seat-overage`); a plan with fewer seats than people removes nobody at once.
5. **`settings`** pages by `firesio.settings.route(group, { permission, historyPath })` + `firesio.settings.history(...)` and the package's `ui/settings/page` and `/history` (the words are `settings.<group>.*` in
   the catalogue); **`setup`**: `defineSetup({ steps })` (an id, a `href`, a `done` check, an optional `requires`) and `<SetupChecklist view={...} />` on the home page, loaded by `firesio.setup.view(args)`.
6. **Page contract**: every `ui/*` page exports `loader`, `action`, `load<Page>`, `<page>Intents` and a page component taking `slots` (`top`, `main`, `aside`, `form`) and `columns`. `NewTicketSlots`, `SupportThreadSlots`,
   `ReplyFormSlots` are gone. Commands are data: `teamAction({ ...teamIntents, mine })`. A package route module exports plain `loader` and `action` FUNCTIONS: an app with a custom intent map writes `export function action(args) { return teamAction({ ...teamIntents, mine })(args); }`, never `export const action = teamAction(...)` at the top level (a top-level call keeps the server code in the browser's chunk). An unknown `intent` is a 400.
7. **`staffTools`**: `(define) => define({ resources, panels, actions })` (`app/wiring/staff-tools.ts`: one resource and one action as the example; the portal asks only an app that declares `staffTools: true` in its
   `declared-apps.ts`). **`defineTopic`**, **`defineCustomerData`**, **`defineStanding`** replace the old inline forms where the app used them. An app proxy route is `firesio.proxy({ ... })`, an extension backend
   `firesio.extension({ ... })`; the template has none.
8. **`jobs`** (`defineJob`) and **`flows`** (`defineFlow` + `packageFlows({ gdprExport, d1Export, resendDomain, backfills })`): `app/wiring/jobs.ts` is empty with the recipe in a comment; the template needs no flow of its own.
   `firesio.jobs()` is the job system (`enqueue(kind, payload, { dedupeKey })`), not the old step functions: `refreshSubscriptions()`, `announceShops()`, `backfillMetrics()`, `purgeDevices()` are gone, enqueue the step by kind.
9. **`ai: cloudflareAi({ models, gate })`** (`@firesio/app/ai/cloudflare`) if the app uses AI. Without it the app has none and **the support spam check is OFF** (a stranger's mail opens a conversation) where it
   used to run by default. A gate is a `Guard` (`defineAiGate`, `holdGate`).

**The Worker entry** (`workers/app.ts`): `fetch: firesio.fetch(handler)`, `queue`, `scheduled`, `email` as before, `export const AdminApi = firesio.AdminApi`, and the new exports
`export class FiresioFlows extends firesio.FiresioFlows {}` and `export { ShopCoordinator } from "@firesio/app/preset/coordinator"` (`FiresioRoom` only if realtime is used).

**Routes**: `/healthz` is `firesio.healthz(request)` (200 while D1 and KV answer, with the deploy's version; the portal checks it); the unsubscribe page is `firesio.unsubscribe.loader/action` on the app's `/unsubscribe` route
(`app/routes/public/unsubscribe.tsx`), replacing the campaigns' page; the `/app` layout draws `AdminFrame` (it picks the embedded admin, the POS webview or the phone shell from the surface); the browser's host calls go through
`host()` (`@firesio/app/ui/surface`), never the `shopify` global (`hostGuardFindings` holds it in a test).

**Words**: `app/i18n/locales/<language>/<namespace>.json` (`catalogueFromFiles(import.meta.glob(...))`), the languages ARE the folders, `assertCatalogueComplete` in a test. The package's pages ship English, Spanish and German;
an app swaps a word in its own `locales/<language>/firesio.json`. A component takes plain-string labels built in a loader (`app/i18n/labels.ts`).

## 4. AI, only if the app uses it

Add `ai: cloudflareAi({ ... })` to `createFiresio`; `ai` and `agents` are optional peers an app importing `@firesio/app/ai/cloudflare` installs (`agents` `>=0.33.0 <0.34.0`). `ai` is `undefined` in routes and jobs
without it (`requireAi(ai)` throws `not_configured`). The old tables `ai_models`, `ai_runs`, `ai_usage` are dropped in the NEXT release (step 8); the allowance is the plan's holds (`holdGate`), there is no AI table and no `retention.aiRunDays`.

## 5. Mail: `app/notifications/`

`defineNotify({ messages, layout, senders, lists, resolve, guard, beforeDispatch, on, inbound })`. React Email is the ONLY way to write a mail: a message is an id, a zod schema for its data and an `email: { subject, body }`
whose body is a React Email component; every text is `words.t(key)` from the catalogue. The layout (a React Email component, `app/notifications/layout.tsx`) frames EVERY mail, the package's own included, and **must show
`unsubscribeUrl`** (a mail on consent whose render lacks it is refused). The sender `app` (Cloudflare Email over `EMAIL`, from `EMAIL_FROM`) and `support` are the preset's; add one (`resend()` and the others of
`@firesio/app/notify/providers`) to send from another provider. **Cloudflare Email carries transactional mail only**, so campaigns (mail on consent) need a sender that accepts consent and are off in the template.
`send(type, { account, to, vars })` is `services.notify.send(message, { shop, to, vars, dedupeKey })`. The package's own mails (support replies, invitations, the seats notice) are React Email bodies in the app's layout;
replace one by declaring a message with the same id. `NOTIFY_SECRET` (32+ characters) is required. Rule: `.claude/rules/notify.md`. Port each old message by hand; keep its golden test through the new pipeline
(`testNotify` with `reactEmailRenderer()`).

## 6. `wrangler.jsonc`, top level AND `env.production` (a named environment inherits nothing)

- **Queues** (`<slug>-<role>[-dlq][-prod]`, `queueRole` is the one way out): producers `WEBHOOK_QUEUE`, `JOBS_QUEUE` (`<slug>-jobs`), `NOTIFY_QUEUE` (`<slug>-notify`); consumers for `<slug>-webhooks`, `<slug>-jobs`
  (`max_retries: 100`, the platform's ceiling: the job system counts attempts itself, `dead_letter_queue: <slug>-jobs-dlq`), `<slug>-notify`, `<slug>-mail-events` and each `-dlq`. The mail-events queue has no producer (Email
  Sending's event subscription writes to it). Remove `CAMPAIGNS_QUEUE` and the campaigns queues. **Create every queue before the deploy**, with a 14 day retention (`--message-retention-period-secs 1209600`).
- `workflows`: `{ name: "<slug>-flows", binding: "FLOWS", class_name: "FiresioFlows" }`; `durable_objects` `SHOP_COORDINATOR` (`ShopCoordinator`) with `migrations: [{ tag: "v1", new_sqlite_classes: ["ShopCoordinator"] }]`;
  `analytics_engine_datasets` `USAGE`; `version_metadata` `CF_VERSION_METADATA`. Only if the app uses them: `BROWSER` (documents; `compatibility_date` 2026-03-24 or later), `IMAGES`, `FLAGS`, `SHARED_<NAME>` (Secrets Store),
  the realtime Durable Object (migration `v2`), `UPLOADS` while any conversation has a file.
- Secrets/vars: `NOTIFY_SECRET` (secret); `EMAIL_FROM` empty means no sender (every mail `skipped:no_sender`); `STAFF_ALERT_EMAIL` is no longer read (delete it); `EVENT_HASH_SECRET`, `EVENT_HASH_KEY_ID` and `PARTNER_API_TOKEN`
  are read through the Secrets Store when `SHARED_<NAME>` is bound, else the plain secret.
- **`compatibility_date`: `COMPATIBILITY_DATE` of `@firesio/app`** (2026-11-13), one for the platform (`tools/architecture/compatibility-date.test.ts`). Do not go to 2026-11-17 or later without testing.
- `observability` with `traces` and a sampling rate, `limits.cpu_ms` below the 30 s default, crons: a minute, an hourly and a daily one (`DRAIN_ONLY_CRON`, `HOURLY_CRON`, `DAILY_CRON`), a `previews` block with staging
  bindings, `public/_headers` with `immutable` for the hashed assets (the template already had it), `.dev.vars.example` with `NOTIFY_SECRET`. Placeholders stay placeholders (`npm run check:placeholders` refuses them in production).
- Tests: the Vitest unit and DOM projects alias `cloudflare:workers` and `cloudflare:workflows` to `@firesio/app/preset/testing/cloudflare-workers` and `.../cloudflare-workflows` (`vitest.config.ts`); `installShop(firesio, env, ...)` takes the typed `firesio` directly; the Miniflare test bindings need `NOTIFY_SECRET` (32+ characters).

## 7. Run the migration generator and READ the SQL

`drizzle.config.ts` takes `firesioSchemaPaths({ settings: true, setup: true, campaigns: true })` plus `@firesio/app/conversations/d1` (the thread store support sits on; `firesioSchemaPaths({ messaging: true })` lists it too). Then
`npx drizzle-kit generate` (it needs a terminal and asks "created or renamed?": answer "created" for a new table, and for a column the generator offers as a rename of an old one). Expected, all of it ADDITIVE:

- `shop_subscriptions`: `revision` (default 0), `verified_at`, `cancel_effective_on`; `shops`: `currency_code`, `taxes_included`, `address`, `primary_locale`; `content_overrides`: `source_text`.
- New tables: `notify_deliveries`, `notify_suppressions`, `notify_consents`, `notify_scheduled`; `firesio_job_claims`, `firesio_dead_letters`; `firesio_settings_audit`; `firesio_setup`; `portal_command_runs` (apply BEFORE
  deploying: the portal's commands need it); `shop_probes`; `conversations`, `conversation_participants`, `conversation_lines`, `conversation_messages` (+ the new columns), `conversation_attachments`, `support_cases`.
- Campaigns (if the app kept them): `campaigns.owner` (default `platform`), `campaigns.scheduled_for`, `campaign_recipients.owner` and indexes.

**Take out by hand every `DROP TABLE` and `DROP COLUMN` the generator wrote**, and say so in a comment at the top of the file: `notification_logs`, `notification_preferences`, `ai_models`, `ai_runs`, `ai_usage`,
`support_tickets`, `support_messages`, `support_attachments`, `campaign_unsubscribes`, `messaging_consent`, `messaging_outbox`, `messaging_orphan_statuses`, and the columns `campaigns.last_pump_at`,
`messaging_connections.consent`, `conversation_messages.attachments`. The previous release still reads them and D1 does not roll back with `wrangler rollback`. They go in the NEXT release, in a file named
`<number>_<name>_contract.sql`, once the flows of step 8 have run everywhere. `drizzle-kit generate` will not write them again (the snapshot no longer lists them). The template's `0006_firesio_2_0.sql` is the worked example.

**Hold the history to it in a test**: `tools/architecture/migration-guard.test.ts` runs `checkMigrations(files, { baseline })` from `@firesio/app/core/testing/migrations` over `drizzle/` (the baseline is the latest migration number
when you add the guard; move it forward only after a release shipped what it covers), `tools/architecture/migration-rows.test.ts` proves the rows survive, and `schema-drift.test.ts` lists the tables awaiting their contract
file (`CONTRACT_PENDING`).

## 8. One-shot flows (an app that holds the old data)

Register them in `packageFlows({ backfills: [...] })` in the release that carries 2.0, start each once, and delete each after it has run everywhere:

- `supportThreadsFlow` (moves `support_*` into the conversation tables; resumable, idempotent) BEFORE the first customer data request;
- `campaignUnsubscribesFlow` (moves `campaign_unsubscribes` into the kernel's consent on `platform.announcements`), if the app sent campaigns;
- `textingConsentFlow` (moves `messaging_consent`; `messaging_outbox` drains), if the app texted;
- **`vaultResealFlow`**: BREAKING for stored data. `Vault.open` no longer opens a value sealed WITHOUT its binding (it fails closed, `unreadable`). Every connection credential (`messaging_connections.secrets`) and every
  `secret()` setting sealed before 2.0 must be sealed again once: `vaultResealFlow({ ports: (s) => ({ db: s.env.DB, vault: createVault(keyring, randomBytes), settingsGroups: [{ group, secretKeys }], onSkipped }) })`.
  A value it cannot read is passed to `onSkipped` and left: the merchant enters it again. A settings group kept in the app's own tables is not covered: use `resealWithBinding` over its rows. The template stores no
  secret, so it has none to move.

## 9. Before deploying

- `npm run verify` and `CLOUDFLARE_ENV=production npx react-router build` (build only; never a deploy script), `npx drizzle-kit generate` (no schema changes), `npm run check:placeholders` (must pass for production).
- Apply the migration BEFORE the Worker (`npm run cf:deploy` and Workers Builds do); create the queues; set `NOTIFY_SECRET`; subscribe the mail-events queue to the sending domain's events and turn on the spend alerts
  (`docs/OPERATIONS.md`, "Mail", "Observability, cost and what pages you"). Change the Workers Builds build command to `npm run verify && npm run build`.
- Register the new groups with the portal in its `declared-apps.ts` (`staffTools: true` if you declare staff tools; the `system` health group and `shops()` need nothing).

## 10. The bundle budget, and what is still unverified

- **The admin bundle budget is a rule, not a number to raise.** The template measures 167,151 bytes gzip against 195,000 on 2.1.1 (it was 227,122 on 2.0.0 and 196,151 on 2.1.0: a route module's server code, with zod, in the page's chunk). When `npm run build` fails at `scripts/bundle-budget.mjs`, find the cause: `react-router build --sourcemapClient`, then sum `sourcesContent` per source for each chunk; look at a template import of a package barrel instead of its narrow subpath, a top-level call in a route module, a catalogue import in a component. A package-side gap is reported with the entry, the size and what to split, never worked around by raising the ceiling.
- The welcome mail's link is the app's own entry (`<SHOPIFY_APP_URL>/?shop=<shop>`): shopify.dev documents no admin URL for linking a merchant to an installed app.
- Unverified: that a failing Workers Builds build command stops the deploy; the Email Sending `--events` spelling; a real send; the Free-zone WAF wording.
