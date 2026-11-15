# Template changelog

An app takes a newer template by merging its tag (`template-v<version>`, see `template-files.json`: the `template` files come over
unchanged, the `app` files are the app's). Each entry says what to do besides the merge.

## template-v1.0.0 (unreleased)

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
- `app/components/AppNav.tsx` and `app/core/config.test.ts` are the app's (`template-files.json`). The rules, skills and docs describe this template (webhook route form, crons,
  operations runbook, adoption checklist) and no longer ask for code that is not here.
