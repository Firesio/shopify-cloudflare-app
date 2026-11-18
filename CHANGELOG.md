# Template changelog

An app takes a newer template by merging its tag (`template-v<version>`, see `template-files.json`: the `template` files come over
unchanged, the `app` files are the app's). Each entry says what to do besides the merge.

## template-v1.0.0 (unreleased)

- `@firesio/app` 0.13.1 and `@firesio/portal-contract` 0.6.0 (additive since 0.10.1; the package's CHANGELOG lists every addition). No schema change
  (`drizzle-kit generate`: no changes). What changed here, and what an app on the previous state of this template does besides the merge:
  - **`firesioVite()`** (`@firesio/app/vite`) is the last plugin of `vite.config.ts`, and the hand-written `optimizeDeps` are gone (the browser
    list and the Worker's `exclude`/`include` of `@firesio/app`, `ai`, `agents/models/ai-sdk`, `react/jsx-runtime`): the plugin keeps ONE copy of
    the package in the dev server, without which every package page answered 500 "No value found for context" in `npm run dev`. React Router's
    plugin pre-bundles React and the router and Vite's scan finds the app's own imports. An app with its own `optimizeDeps` keeps only entries
    for packages of ITS own (never `@firesio/app` or a subpath: the plugin warns). Test: `tools/architecture/vite-config.test.ts`.
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
