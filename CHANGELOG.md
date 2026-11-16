# Template changelog

An app takes a newer template by merging its tag (`template-v<version>`, see `template-files.json`: the `template` files come over
unchanged, the `app` files are the app's). Each entry says what to do besides the merge.

## template-v1.0.0 (unreleased)

- `@firesio/app` 0.7.1 and `@firesio/portal-contract` 0.4.0. One migration, `drizzle/0001_eminent_enchantress.sql`: `notification_logs` (every mail is
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
- `mail.daily_max` is gone from `PLANS`, the entitlement labels and the meters: nothing in the preset counts mail against a daily allowance, so the plans page showed 0 forever.
  An app that sends mail of its own adds the key back with its own `services.usage.consume` call and a `meters` entry.
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
