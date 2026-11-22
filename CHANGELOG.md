# Template changelog

An app takes a newer template by merging its tag (`template-v<version>`, see `template-files.json`: the `template` files come over
unchanged, the `app` files are the app's). Each entry says what to do besides the merge.

## template-v2.0.0 (unreleased)

**`@firesio/app` 2.1.1 (2.0.0 plus the 2.0.1 to 2.1.1 fixes) and `@firesio/portal-contract` 1.3.0.** A major release of the package that REMOVES what it replaces (nothing is kept deprecated), and the template moves onto it completely. An app that is on
a 1.x template takes this tag by following `docs/migrating-to-2.0.md` (an ordered checklist of the package's own changeset), not by merging alone. What changed in the template:

- **One call, typed**: `createFiresio<Env>()({ ... })` with ONE `services` factory (`AppServices`, `app/core/app-services.ts`), the typed `on` map of events (the welcome mail on `installed`), `jobs`, `flows`
  (`packageFlows`), `staffTools` (one resource, one action: `app/wiring/staff-tools.ts`), `setup` (the onboarding checklist), `i18n` and `notify`. Gone: `withServices`, `lifecycle`, `around`, `onlineTokens`, the
  members' `ownerRole`/`firstUserRole`/... (the small `defineMembers`), `STAFF_ALERT_EMAIL`, campaigns (OFF: they need a sender that accepts consent), `app/routes/campaigns/`.
- **Mail**: `app/notifications/` (a React Email layout that shows `unsubscribeUrl`, a sample welcome message, `kit.ts`, hook examples in comments), words in the catalogue; the sender `app` is the preset's Cloudflare
  Email over `EMAIL_FROM`; `NOTIFY_SECRET` is required; the public `/unsubscribe` page. Rule: `.claude/rules/notify.md`.
- **Words**: `app/i18n/locales/{en,es}/app.json`, `assertCatalogueComplete`, label builders for the app's own pages, the settings page's words; `localeIn(I18N)` in the root loader.
- **Pages**: settings by `firesio.settings.route` (+ history), the home page's `SetupChecklist`, `AdminFrame` in the `/app` layout, the package's `PhoneFrame` for the phone chunk, `/healthz` is `firesio.healthz`.
- **Cloudflare**: queues `<slug>-webhooks|jobs|notify|mail-events` (+ `-dlq`, `-prod`), `FLOWS`, `SHOP_COORDINATOR` (Durable Object, SQLite migration `v1`), `USAGE`, `CF_VERSION_METADATA`, `observability.traces`
  (sampled), `limits.cpu_ms`, the shared `compatibility_date` (2026-11-13), a `previews` block, `NOTIFY_SECRET`. `wrangler` 4.166 and `@cloudflare/vitest-plugin` 1.9. `npm run new-app` renames and lists the new resources.
- **D1**: `drizzle/0006_firesio_2_0.sql` is EXPAND ONLY (new tables and columns; the generated `DROP`s were taken out by hand and wait for the next release's `*_contract.sql`);
  `tools/architecture/migration-guard.test.ts` (`checkMigrations`) holds every later migration to it.
- **The shell copies are the package's**: `app/core/{render-error,install-target,response-headers,paths,api-version}.ts` are deleted (`@firesio/app/shell`); `npm run check:placeholders` reads the package's `ADMIN_API_VERSION`.
- **Docs and rules**: `docs/OPERATIONS.md` (incident: rollback first, then Time Travel; D1 insights; mail; observability, spend alerts without a hard limit, Issues and Monitors to the portal, health check; R2 lifecycle;
  previews; the build command `npm run verify && npm run build`), `docs/migrating-to-2.0.md`, rules `notify`, `jobs-and-flows`, `i18n`, and the `cloudflare` rule's "why" line per service.
- **Bundle**: the admin's scripts measure 167,151 bytes gzip against the budget of 195,000 (`scripts/bundle-budget.mjs`, unchanged). On 2.0.0 they measured 227,122, and 2.1.0 196,151, because route modules pulled their server code (zod) into the page chunk; 2.1.1 fixed it upstream. **The budget rule: never raise it to make a build pass; find what landed in which chunk (`react-router build --sourcemapClient`, sum `sourcesContent` per chunk) and fix the cause, or report a package-side gap with the entry, the size and what to split.**
- **Rules learned on the way** (`docs/migrating-to-2.0.md`): the `services` factory is written BEFORE every option that uses the services (`ServicesMustComeFirst`), and every such option is typed with `AppServices`; a package route module exports plain `loader`/`action` functions, so an app with its own intent map writes `export function action(args) { return myAction()(args); }`, never a top-level call; the test stand-ins are `@firesio/app/preset/testing/cloudflare-workers` and `.../cloudflare-workflows` (public entries, aliased in `vitest.config.ts`), and `installShop(firesio, env, ...)` takes the typed `firesio` as it is.
- **The welcome mail links to the app's own entry** (`<SHOPIFY_APP_URL>/?shop=<shop>`, tested), because shopify.dev documents no admin URL for linking a merchant to an installed app (searched 2026-11-22).
- **Still unverified**: that a failing Workers Builds build command stops the deploy; the `--events` spelling of the Email Sending event subscription; a real send through Email Sending; the Free-zone WAF wording.

## template-v1.1.0 (unreleased)

- `@firesio/app` 1.10.0 (only adds): `revenue.mrr` is zero, not missing: an app with no paying shop sends `{ amount: 0, currency }`, so the portal shows "0". An app reports its own numbers with `createFiresio({ metrics: { catalogue, collectors, backfill } })` (mark the two that matter `featured: true`: the portal's dashboard card shows an app's own numbers first, four at most).
- `@firesio/app` 1.9.0 (only adds): the support thread and new-ticket pages follow the repair app's layout. The copy list takes one address at a time (a row per address with a remove button, "Add email" opens a dialog with one email field, no "separate with commas" hint, saved from the save bar only), the file picker is an "Add files" button with the limits beside it, and messages are chat bubbles. New optional labels (`cc.dialogHeading|field|placeholder|confirm|cancel`, `files.add`) have English, German and Spanish defaults; an app that translates its own support words adds them.
- `@firesio/app` 1.8.0 (only adds), with 1.7.0 and 1.6.0 before it. **Metrics history is kept whole with nothing to do**: the hourly `metrics_backfill` step keeps a KV mark of the last day covered and every tick covers the days since (first install, a year at most, to two days ago; yesterday is the real daily snapshot's), so an app wired late, wired again, or whose cron was down never has a gap. `createFiresio({ liveMetrics: true })` answers the portal's "Today (live)" from the same collectors; the template does not turn it on (the portal asks only an app whose `declared-apps.ts` entry says `liveMetrics: true`: do both when the app is registered). `firesio.jobs().resendSnapshot(day, tag)` corrects a past day by hand.
- `@firesio/app` 1.6.0 (only adds): `firesio.jobs().resendSnapshot(day, tag)` sends one past day's metrics snapshot again as a correction (the portal keeps the newest of a day); the history backfill sends 120 days a tick. Nothing to do here.
- `@firesio/app` 1.5.0 (only adds). **The library's own pages use `PageActions`** (support list and new ticket, team, member, plans), so serving the POS webview or the phone app later needs no change to them: an app only switches POS on (`[pos] embedded = true`) or PWA (`app/core/features.ts`). The page guard now covers the package's pages too (in the package's own tests); this template's `app/surface.test.ts` keeps covering the app's own pages. Admin bundle 177,233 B gzip (budget 195,000).
- `@firesio/app` 1.4.0 (only adds). **MRR follows the real price**: the daily snapshot's `revenue.mrr` is what shops are charged, an annual charge a twelfth a month (it was the paying shops times the plan's list monthly price). **Metrics history**: a new hourly cron step `metrics_backfill` (on by default; `cron.preset.metrics_backfill: false` leaves it out) sends the portal a snapshot per past day from the first install, a year at most, then stops; a past day carries installs, uninstalls, tickets created and the reconstructed shop count only. An app with its own day-correct counts lists their keys in `metrics.backfill`. No schema change.
- `@firesio/app` 1.3.0 and `@firesio/portal-contract` 1.2.0 (both only add to 1.0.0; an app on 1.0.0 changes nothing to take them). No schema change
  (`drizzle-kit generate`: no changes). What changed here, and what an app on the previous state of this template does besides the merge:
  - **Shop names and the announce sweep.** Every account event now carries the shop's name (`account.name`, read from the app's own `shops.name`), and
    a new hourly cron step, `shops_announce` (on by default, `cron.preset.shops_announce: false` leaves it out, `firesio.jobs().announceShops()` runs it
    by hand), sends `shop.installed` (and `shop.uninstalled` when the uninstall time is known) for every shop the app already had, 300 a tick, so the portal's
    directory fills with shops that pre-date the connection. Event ids are fixed (`announce_install_<shop>`), so running it twice adds nothing. It needs the
    hourly cron the template already declares. Test: `workers/scheduled.e2e.test.ts` now checks the app's own events and leaves the sweep's out
    (`announce_` ids); the sweep has its own tests in the package.
  - **How the app's numbers are drawn.** The standard, health and ticket metric keys carry `chart`, `featured`, `group` and `good` (contract 1.2.0), so the portal's
    dashboard shows them as cards with charts without any code here. An app's own keys may declare them in their `defineMetrics` entries; left out, the portal derives a default.
  - **Push refusals say why.** A push service's refusal reason (Apple's `BadWebPushRequest`, `VapidPkHashMismatch`...) is kept in the delivery report and its log line.
  - **Campaigns are ON in the template.** The preset serves the contract's `campaigns()` group from `campaignDelivery: {}` (`app/firesio.server.ts`). What came with it,
    and what an app on the previous state does besides the merge: (1) `drizzle.config.ts` lists the campaigns tables (`firesioSchemaPaths({ settings: true, campaigns: true })`)
    and `drizzle/0004_*.sql` creates them (`campaigns`, `campaign_recipients`, `campaign_unsubscribes`, `campaign_requests`): an app with its own migrations runs
    `npm run db:generate` and reads the SQL; (2) `wrangler.jsonc` declares the producer `CAMPAIGNS_QUEUE` and the consumers `my-app-campaigns` (with
    `dead_letter_queue`) and `my-app-campaigns-dlq`, top level AND `env.production` (`-prod`, `-prod-dlq`); **create the four queues with `wrangler queues create` BEFORE the deploy**;
    `npm run new-app` renames them to the slug and `npm run check:placeholders` refuses a name that does not carry it; (3) the public route `/campaigns/unsubscribe`
    (`app/routes/campaigns/unsubscribe.ts`, a line in `app/routes.ts`); (4) `EMAIL`, `EMAIL_FROM` on a verified Email Sending domain and `ATTACHMENT_TOKEN_SECRET` of 32+
    characters (the template already declares them); (5) `campaigns: true` in the portal's `declared-apps.ts`. An app that does not want campaigns removes
    `campaignDelivery`, the queues and the route (the launch check then stops asking for the queues). Not verified: nothing has been sent through Cloudflare Email Sending;
    send a campaign to yourself before a large one.
  - **POS: `PageActions` and `AppSurface` are in.** The home page draws its actions with `PageActions` (the header slots on the web admin, one bar in Shopify POS), the `/app` layout wraps its
    outlet in `<AppSurface surface back>` (nothing drawn on the web admin), `createFiresio({ surface: {} })`, the report route `app/routes/app/surface.ts` and its line in `app/routes.ts`, and
    `app/core/back.ts` (the parent of each page, for the POS Back button: the app edits its table). Held by tests: `app/surface.test.ts` (`pageActionsFindings` over `app/routes/app/**` and `app/components/`, `reportRouteFindings`),
    `app/dom/HomeView.dom.test.tsx` (`pageOnEverySurface`, in jsdom: `vitest.config.ts` has a `dom` project for `*.dom.test.tsx`, `app/dom/tsconfig.json` type-checks them with the browser's types, `jsdom` is a dev dependency).
    Costs nothing on the web admin. `[pos] embedded = true` (what lists the app in the POS app) is a commented line in `shopify.app.toml`: the app turns it on.
  - **The staff phone app is written and behind ONE switch, off.** `app/core/features.ts`: `export const PWA = false;`. Everything it needs is in the template (the public pages `/m`, `/m/start`, the manifest, the pairing calls and `/sw.js`
    under `app/routes/m/` and `app/routes/sw.ts`, `/app/phone`, `app/components/PhoneLayout.tsx` loaded with `lazy()`, `app/core/phone.ts` with the deny-list and the manifest, two placeholder icons in `public/`), connected only through the switch
    in `app/routes.ts`, `app/firesio.server.ts` and the layout. Always there, so the switch needs no migration or wrangler edit: migration `drizzle/0005_*.sql` (the three device tables, `drizzle.config.ts` lists their schema) and the rate limit
    `DEVICE_LINK_LIMITER` (top level AND `env.production`). `app/features.test.ts` fails `verify` and says which piece is missing when it is on, or still connected when it is off. `scripts/bundle-budget.mjs` (run by `npm run build`)
    measures the client bundle: 177,040 gzip bytes for the admin with the switch off (173,720 before this change), the phone shell apart at 17.7 KB gzip, never requested until a paired phone opens the app. What an app on the previous state does
    besides the merge: `npm run db:generate` finds nothing new if it takes `drizzle/0005_*.sql` and `drizzle.config.ts` as they are; merge `wrangler.jsonc` (`DEVICE_LINK_LIMITER` in both places), `app/routes.ts`, `app/firesio.server.ts` and the layout by hand
    (they are its files); turning it on is `docs/POS-AND-PHONE.md` section 3. Not verified: a real pairing, iOS, the look next to Shopify Mobile.

## template-v1.0.0 (unreleased)

- `@firesio/app` 1.0.0 and `@firesio/portal-contract` 0.6.0 (1.0.0 only adds to 0.13.1: the POS webview and the staff phone app, both opt-in, see `docs/POS-AND-PHONE.md`; an app on 0.13.1 changes nothing to take it; additive since 0.10.1; the package's CHANGELOG lists every addition). No schema change
  (`drizzle-kit generate`: no changes). What changed here, and what an app on the previous state of this template does besides the merge:
  - **`firesioVite()`** (`@firesio/app/vite`) is the last plugin of `vite.config.ts`, and the hand-written `optimizeDeps` are gone (the browser
    list and the Worker's `exclude`/`include` of `@firesio/app`, `ai`, `agents/models/ai-sdk`, `react/jsx-runtime`): the plugin keeps ONE copy of
    the package in the dev server, without which every package page answered 500 "No value found for context" in `npm run dev`. React Router's
    plugin pre-bundles React and the router, and Vite's scan of the Worker's entry and route modules finds what the Worker imports; the
    browser's environment is not scanned (see the item on `vite.config.ts`'s comment below). An app with its own `optimizeDeps` keeps only
    entries for packages of ITS own (never `@firesio/app` or a subpath: the plugin warns). Test: `tools/architecture/vite-config.test.ts`.
  - **Support attachments.** `app/routes/app/support/upload.ts` (`export { action, loader } from "@firesio/app/ui/support/upload"`) is mounted under
    the /app layout at `/app/support/upload` (`app/routes.ts`), and `paths: { supportUpload: SUPPORT_UPLOAD_PATH }` (`app/core/paths.ts`) turns on
    the file picker of the new-ticket and reply pages. An app merges `app/routes.ts` and `app/firesio.server.ts` by hand (they are its files):
    add the route and the `paths` line. Tests: `app/routes.test.ts`, `workers/support-upload.e2e.test.ts`.
  - **Retention of support conversations no shop owns.** `retention: { unassignedConversationDays: UNASSIGNED_CONVERSATION_DAYS }` (365, in the
    app's own `app/core/retention.ts`): the daily cron erases a stranger's conversation (mail, public form) a year after its last activity; the
    package keeps them for ever otherwise. Say it in the privacy policy (`docs/LEGAL_TEMPLATE.md`, "Retention"); the first daily run after the
    deploy erases every such conversation already older than that. Test: `workers/scheduled.e2e.test.ts`.
  - **The standard layout** (`CLAUDE.md`, "Layout"): three layers a growing app fills, `app/adapters/<feature>/` (the ports over D1, KV, R2,
    Shopify, HTTP), `app/wiring/<feature>.ts` (the app's services bound for a shop and its handlers, plugged into `app/firesio.server.ts`) and
    `app/notifications/`, and feature sub-folders in every layer. Lint now refuses a route that imports `app/db` (a query is an adapter's),
    `createFiresio` outside `app/firesio.server.ts` (tests excepted), and in core `drizzle-orm`, `cloudflare:*`, a value of the preset, the
    package's pages, its D1 adapters and preset parts (and React and `cloudflare:*` in adapters and wiring, `drizzle-orm` and `cloudflare:*` in
    components, i18n, notifications and AI features); `tools/architecture/boundaries.test.ts` probes each. An app whose routes query tables
    moves each query into an adapter of its feature, bound with `withServices`.
  - Not adopted, because the template has no code of that kind (an app that has some adopts them the documented way): `shopRecord` and
    `check(..., { record })` (the template reads no shop row of its own and has no extension backend), `around` (no request context of its own),
    numeric `attempts` and `deadLetterQueues` (no queue of its own: the webhook queues and their DLQs are the preset's), `shopStates` / `getMany`
    (no job over many shops), the notify options `mailCopies`, `textsFor`, `consent`, `template` and ICU plural/select (no mail of its own),
    the support page slots, and the contract's campaign fields (no `campaigns` handler).
- What a large app (Team Up) found when it took the standard layout, fixed here. An app on the previous state of this template takes the
  `template` files of the merge as they come, and does by hand what each item says of its own files:
  - **A dev-server restart keeps the Worker.** `vite.config.ts` told React Router's child compiler (a second evaluation of the file, which must
    leave the Cloudflare plugin out) from the main config by counting evaluations; Vite evaluates the file again each time it restarts the dev
    server (an edit to `vite.config.ts`, `.dev.vars` or `wrangler.jsonc`), so after one restart the Cloudflare plugin was gone and the Worker no
    longer served the app. `scripts/vite-child-compiler.mjs` (`createChildCompilerGuard`, Team Up's) tells them apart by who starts the
    evaluation: React Router's own `configResolved` hook. `vite.config.ts` is the template's: take it, or, if yours differs, replace the counter
    with the guard (`const childCompilerGuard = createChildCompilerGuard()`, `isChildCompiler()`, `...reactRouter().map(childCompilerGuard.markChildCompilerLoads)`).
    Tests: `scripts/vite-child-compiler.test.mjs` (the decision over several evaluations), `tools/architecture/vite-config.test.ts` (the real
    Vite and React Router chain resolved three times in one process: the old counter fails it).
  - **`tools/architecture/schema-drift.test.ts` reads SQL, not prose.** It found table names with a regex over the raw migrations, so a
    comment of a hand-checked migration (`-- the old table is dropped below: create table later`) or a string literal read as a table. The
    comments (`--`, `/* */`) and the text of string literals are blanked first, quoted identifiers kept; a test says a word in a comment or a
    string is not a table. Nothing to do in an app.
  - **The architecture probes are fast and write nothing into `app/`.** `tools/architecture/boundaries.test.ts` linted each probe with the
    whole type-aware config (the TypeScript program of the whole app, for each probe: too slow on a large app) and wrote its probes, and the
    adapter, wiring and messages files they import, into `app/` while it ran, where a test that crawls the sources (route exports, bundle
    guards) found them. The probes now run in a throwaway copy of the layout in `os.tmpdir()` (`tools/architecture/probe-world.ts`: the
    repo's `tsconfig.json`, a link to `node_modules`, an empty module at each imported path), linted by the repo's `eslint.config.js` with
    its own boundaries settings moved there, only the rule under test (`ruleFilter`) and no type-aware parsing; a message without a rule
    (a parse error, an ignored file) counts as a finding. 9.7 s became 1.9 s here. Each probe was checked to fail with its rule loosened
    (a policy widened, `default: "allow"`, `no-unknown-files` off, a ban removed, a cap raised, the resolver's tsconfig or the root path
    broken). An app with probes of its own rules writes them with `createProbeWorld`, and its crawling tests need no exception for them.
  - **A value list core and db both need is declared once, in the feature's vocabulary.** The table refused db → core and core → db and
    said nothing of a status a CHECK constraint and the domain share. Team Up mirrors such lists in `app/db/vocabulary.ts`, held equal to
    the domain's by a test (about forty lists); the standard is one list instead: `app/core/<feature>/vocabulary.ts` (`as const` lists and
    their types), the one file of core db may import (a file category of `eslint.boundaries.js`), and lint refuses any import, function
    or class in it, so no logic and no input reaches the DDL. db → any other core file stays refused, and so does core → db. Worked
    example in `CLAUDE.md` ("Layout"); `tools/architecture/vocabulary-recipe.test.ts` proves its CHECK in SQLite; `boundaries.test.ts`
    probes who may import it and what it may hold (each probe checked to fail with its rule loosened). An app with a mirror in `app/db/`
    moves each list into its feature's `vocabulary.ts`, imports it from the table and from the domain, and deletes the mirror and its test.
  - **A home for test fixtures.** `app/test/` (test support) could import only core, i18n and the composition file, so a large app's shared
    fixtures (helpers that seed tables, build adapters, call routes: Team Up's 21 files, 37 imports) had nowhere to live but copied into each
    test. Test support now reaches what a test reaches (db, adapters, wiring, notifications, components, i18n, routes, AI, workers, the
    entry files), by feature in `app/test/<feature>/`, and stays test-only: no layer may import it, which `boundaries.test.ts` now probes
    for every layer, the composition file and `app/root.tsx` (it probed routes only), each probe checked to fail with its rule loosened.
    An app moves its shared helpers into `app/test/` (or `app/test/<feature>/`) as they are.
  - **`vite.config.ts` says what is scanned, and pre-bundles the browser's own package.** Its comment said Vite's scan of the route modules
    finds what the app's own files import; that holds for the Worker's environment only (the Cloudflare plugin's and React Router's
    `optimizeDeps.entries`). React Router hands the browser's environment no entry while `future.unstable_optimizeDeps` is off
    (`@react-router/dev`'s `getOptimizeDepsEntries` answers `[]`, and Vite then scans nothing), so `@shopify/app-bridge-types`, which
    `app/root.tsx` imports for its side effect, was found on the first page load and the page reloaded. It is now in
    `environments.client.optimizeDeps.include` (`zod` needs no entry: `@firesio/app > zod` serves the app's own copy too, Vite's
    `tryOptimizedResolve`). `tools/architecture/vite-config.test.ts` pins both facts and fails on a package the app's browser code imports
    (the client entry, the components, the side-effect imports of the root and the routes) that nothing pre-bundles; it also closes what
    React Router's plugin opens when the config is resolved (its child compiler and the route typegen watcher, which left
    `.react-router/types` half written when the test process exited). An app with its own browser packages lists them there.
- `@firesio/app` 0.10.1, which carries 0.9.0, a BREAKING release (what a new form replaces is removed, not deprecated; the package's own CHANGELOG, `packages/app/CHANGELOG.md` in the
  Firesio platform repo, lists everything). What changed here, and what an app on an earlier state of this template does:
  - **Plans are declared once.** `app/core/plans.ts` is `definePlans({ features, plans })`: each feature is a `capability`, `capacity`, `quota` or `metered` with its
    `name`, and each plan gives a `grants` value per feature (`limit(50)` is `50`, `unlimited` is `"unlimited"`, `enabled`/`disabled` are `true`/`false`); exactly one plan
    is free. The plans page, its comparison rows and its usage meters are generated from it, so `app/i18n/labels.ts` (`ENTITLEMENT_LABELS`), `labels.entitlements`
    and the `meters` option are gone: move each name to its feature, and each meter to the feature it measured (a `quota` shows the counter kept under its own key).
    The preset no longer adds the open-ticket meter: `tickets.max` is a `capacity`, and its count is the preset's `services.openTicketCount`. Core imports no
    service, so `app/core/plans.ts` exports the pure catalogue (`PLANS`) and `app/firesio.server.ts` gives the count beside the services
    (`counts: (services) => ({ "tickets.max": (shop) => services.openTicketCount(shop) })`, 0.10.1); code that read `PLANS[handle]` reads
    `PLANS.plans[handle]` (`import { PLANS } from "~/core/plans"`) or `services.plans[handle]`. The template declares no `metered` feature (it has nothing
    Shopify could bill per use, and a meter must exist in the Partner Dashboard first), so `drizzle.config.ts` does not pass `{ metered: true }`.
  - **One migration, `drizzle/0003_mean_trauma.sql`.** The settings table is RENAMED, `shop_settings` to `firesio_settings` (`ALTER TABLE ... RENAME TO`: saved
    settings stay); `plan_usage_holds` (`services.usage.reserve` / `commit` / `cancel`, with the CHECKs and `WITHOUT ROWID` of the library's `holdsTableSql()`);
    `content_overrides.hidden` (`'[]'` for the edits already saved). An app that generates its own migration answers "renamed" when drizzle-kit asks about
    `firesio_settings` (the default answer, "create", drops the old table and its rows). Migrate and deploy together (`npm run cf:deploy` does): between the
    two, the Worker still on 0.8 reads `shop_settings`, which is gone, so its settings page fails until the new Worker is live. New test `tools/architecture/migration-rows.test.ts`: rows written before the migration are still there after it.
  - **Options an app may have used.** `access` is a list of rules (`[{ path: "/app/settings", needs: "settings:manage" }]`, or `read` and `write` apart) instead of a
    record; `firesio.check(auth, { permission, surface, respond })` instead of a positional permission; a `webhooks` entry takes `unknownShop: "run" | "defer"` and
    `heldWhileFrozen` (`requiresShop` is gone); `uninstallProbe` is gone (`cron: { preset: { uninstall_probe: false } }` leaves the step out, `firesio.jobs()` runs it);
    `support.limitersWhenUnbound: { tickets, form, mail }` replaces `limiterWhenUnbound`; the `notifications` option is gone (`notify.messages` only), and `notify`
    answers `can` / `look` / `copies` where it had `brand` and the standard entitlement names (the skip reason `not_entitled` is `not_allowed`).
  - **Dates.** Every boundary is UTC (a quota's day and month, the end of a cancellation's day): `timeZone` left `periodWindow`, `endOfDayIn`, `ShopRef` and
    `CountWindow`. A shop's time zone only formats what a person reads.
  - The hourly cron also gives back quota a crashed run left reserved (`held_usage_sweep`, `heldUsageMaxAge`).
- Settings: a sample group (`app/core/settings.ts`, `defineSettings` with `visibleWhen` and `clearWhen`) and its page `/app/settings`
  (`routes/app/settings.tsx`, `createPage` + `SettingsForm`, `app:manage`, linked in the menu), `shop_settings` in `drizzle/0002_careful_joshua_kane.sql` (renamed `firesio_settings` by `0003`, above).
  A group with `secret()` fields needs `SETTINGS_SECRET_KEY` in production (or `SETTINGS_SECRETS_PLAINTEXT: "allow"` at the top level in development).
- `@firesio/app` 0.8.0 and `@firesio/portal-contract` 0.4.0. One migration, `drizzle/0001_eminent_enchantress.sql`: `notification_logs` (every mail is
  logged and deduped), `plan_usage_ops` (idempotent `consume`/`release`), `shop_plan_grants.request_id`, the subscription's real charge on
  `shop_subscriptions` (interval, price, cycle start, pending change), `shops.proxy_path_prefix`, `shop_members.locale` (the language remembered per member).
- The mails show the app's logo: `identity.logo` (`/logo.png`, a placeholder in `public/` to replace).
- `app_subscriptions/update` is subscribed in both tomls (the plan is read again when the merchant changes it in Shopify's admin).
- Production runs the hourly cron too (`0 * * * *`: the uninstall probe, the one-time ticket backfill, an app's hourly work).
- New routes: `support/file/:id` (`firesio.supportFile`: a ticket's file by its signed link, for the pages, the portal and the mails) and the
  `*` route inside `/app` (`@firesio/app/ui/shell/not-found`, a 404 with the app's menu).

The template is the minimal app on `@firesio/app`, the one package with the `createFiresio` preset (roadmap step 13, then ticket 17). It is a NEW BASELINE: the schema is one migration
(`drizzle/0000_baseline.sql`), and an app built on an earlier template migrates one feature at a time (roadmap step 14), not by
merging this tag.

- `app/wiring/`, `app/adapters/`, `workers/admin-api.ts`, `workers/inbound-email.ts` and the generic part of `app/core/` are gone: they are
  the preset's. What stays is `app/firesio.server.ts` (the config), the identity, plans and members, the routes and the public pages.
  The tables of the template (`shops`, `shop_subscriptions`, `shop_plan_grants`, `notification_preferences`) are the preset's
  (`@firesio/app/preset/d1`), same shape: `drizzle-kit generate` reports no schema change.
- Replaced by the libraries: money, billing and plans, notifications, support, members, the text units, AI, Web Push, the Shopify
  webhook inbox and GDPR purge. The staff console, MCP, campaigns and the `api/v1` routes are gone (the portal replaces them).
- New: the AdminApi entrypoint (the portal's commands, `firesio.AdminApi`), the `PORTAL_EVENTS` producer and the D1 outbox, the portal's blocklist KV binding,
  `shop.installed`, `shop.reinstalled`, `shop.uninstalled`, `subscription.changed`, `account.redacted` and a daily `metrics.snapshot`.
- New: `eslint.boundaries.js` (the layers), size caps, no `as`, no `any`, no `Date.now` or `crypto.randomUUID` outside tests (the preset's runtime reads them),
  a verify workflow, `npm run new-app`, `/healthz`, a test that compares the top-level and production bindings.
- Rate limits now fail closed (a missing or failing binding denies), as docs/architecture.md section 6.4 says.
- `npm run check:placeholders` no longer refuses a scope (an app adds the scopes it uses); it now requires the scopes of `shopify.app.toml` to equal the `SCOPES`
  var of `env.production`, those of `shopify.app.dev.toml` to equal the top-level `SCOPES`, and the two tomls to agree, and it reads the webhook `api_version`
  from `app/core/api-version.ts` instead of a hard-coded value.
- `npm run new-app` blanks `client_id` in both Shopify configs (the template ships none), inserts a display name literally (`$&` and `$1` are not replacement patterns),
  answers `--help`, and prints the portal registration: one PR to the Firesio platform repo (`declared-apps.ts` and a service binding to `<slug>-production`).
- `SHOP_CUSTOM_DOMAIN` is no longer in `secrets.required` (optional in the preset); `PARTNER_API_TOKEN` stays required by this template's choice.
- `mail.daily_max` is gone from the plans: nothing in the preset counts mail against a daily allowance, so the plans page showed 0 forever.
  An app that sends mail of its own adds it back as a `quota` feature together with its own `services.usage.consume` call.
- `scripts/ci-release.mjs` deploys the Shopify app config with the pinned local CLI (`scripts/shopify.mjs`), not `@shopify/cli@latest`; lint also bans `globalThis.crypto.randomUUID`.
- `routes/webhooks/receive.ts` is `firesio.webhookRoute` (`action` is `firesio.webhook(request)` for every topic): the preset (`@firesio/app` 0.2.x with the all-topics receiver) verifies the HMAC first, so a bad signature is a 401 even for a topic nobody handles, and a verified topic it does not run is a 200 with nothing queued. The `firesio.handles(topic)` branch and its `webhook.unhandled` log line are gone; the docs, rules and the `add-webhook-topic` skill describe the current behaviour.
- New end-to-end tests that boot the real Worker entry (`workers/*.e2e.test.ts`, the `e2e` vitest project): the AdminApi over a service binding with RPC, a signed `app/uninstalled` and `shop/redact` from `fetch` through `queue` to the D1 effect (and a redelivery), and every cron into `PORTAL_EVENTS`. `@firesio/app/preset/testing` (`installShop`, `recordSends`, `deliver`, `tick`) and `app/test/server-build.ts` are their helpers; `eslint.boundaries.js` knows the second one.
- Review fixes (launch contract): `npm run check:placeholders` also requires `env.production` to answer on ONE custom domain (`routes` with `custom_domain`, `workers_dev: false`, `preview_urls: false`; the pattern is `REPLACE_ME` until set), the webhook queues to be exactly `<slug>-webhooks[-prod]` with their DLQs, and both tomls to subscribe the same topics at the same `/webhooks/` URIs and keep their `[build]` flags (`shopify app config link` drops them); `shopify.app.toml` gains `include_config_on_deploy = true`. `scripts/ci-release.mjs` runs the check first, logs nothing about `SHOPIFY_APP_AUTOMATION_TOKEN`, and the migration scripts read the database name from `wrangler.jsonc` (no `--database` flag).
- Review fixes (runtime): every response of the Worker gets the security headers (`workers/app.ts` wraps `fetch`), and the strict CSP is the default for everything except `/app`, `/auth`, `/webhooks` and `/healthz`; the support form refuses a body declared over 64 KB (413); the root has an `ErrorBoundary` (the library's `RootErrorBoundary`: plain HTML, status and one line, no stack outside a dev server) that also renders what the /app middleware throws (a blocked shop's 403, App Bridge's session-token page); `/app` opened with no shop goes to `/`; `<html>` has `suppressHydrationWarning`.
- Review fixes (repo): `verify` includes `wrangler types --check`; `npm test` runs `scripts/**/*.test.mjs` by glob; `@react-router/dev` is a devDependency; `.mcp.json` pins `@shopify/dev-mcp`; the vitest project of a test is its file name (`*.e2e.test.ts`, `*.workerd.test.ts`, else Node); skills are committed in `.claude/skills/` (no installer); `docs/polaris/` and its sync script, `.graphqlrc.ts` and the codegen packages are gone (README says how to add codegen back); `docs/UPGRADING.md` describes only what applies now; new tests: public routes through the real Worker, the /app boundary, the schema-drift test. `verify.yml` fires on `template-v*` tags.
- Adopts the library's pieces and deletes the template's copies (needs `@firesio/app` 0.4.0): `EmbeddedProvider`, `AppErrorBoundary`, `RootErrorBoundary`, `thrownResponseHtml` and `describeRequestError` from `@firesio/app/ui/shell` (`app/components/EmbeddedProvider.tsx`, `request-error.ts`, `thrown-response.ts` and `failure.ts` are gone; the root keeps a few lines that render App Bridge's session-token page, which `RootErrorBoundary` does not); `localeOf` and `directionOf` from `@firesio/app` (`app/i18n/language.ts` is gone); `firesio.authenticate` in `routes/auth/callback.tsx`; `firesio.webhookRoute` in `routes/webhooks/receive.ts`; the public support page is the library's `ui/support/contact` module (its `loader` and `action`, `contactContext` set in the route's middleware; `app/core/body-limit.ts` is gone, so a form post with NO `Content-Length` is no longer a 411, and invalid input is a 400); `firesioSchemaPaths()` in `drizzle.config.ts`; the test helpers of `@firesio/app/preset/testing` and the exported crons instead of `app/test/e2e.ts` and a regex over the package's source (`app/test/sends.ts` puts a recorded queue back after each test).
- The Worker consumes the webhook dead-letter queues (`<slug>-webhooks-dlq`, `-dlq-prod`, a consumer each in `wrangler.jsonc`; create them before the deploy): a dead delivery is marked `dead_letter` in `webhook_deliveries` and logged `webhook.dead_letter`; retries back off exponentially (30 s doubling, at most an hour). `npm run check:placeholders` and the bindings test require the consumer. New optional secret `SETTINGS_SECRET_KEY` (seals `settings` secrets at rest; `.dev.vars.example`, `docs/OPERATIONS.md`).
- `app/components/AppNav.tsx` and `app/core/config.test.ts` are the app's (`template-files.json`). The rules, skills and docs describe this template (webhook route form, crons,
  operations runbook, adoption checklist) and no longer ask for code that is not here.
