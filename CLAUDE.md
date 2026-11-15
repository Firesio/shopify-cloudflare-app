# Claude Code contract

Single source of truth for working in this repo. This repo is set up for Claude Code only.

**This file stays short on purpose.** Detail lives in `.claude/rules/*.md` (each carries `paths:` frontmatter, so it loads only when you read or edit a matching file), in skills (`agent-skills/`, linked into `.claude/skills/` by `npm run setup:skills`) and in `docs/` (never auto-loaded; search with `rg`).

## What this repo is

A **template**, and since ticket 17 **the minimal app on `@firesio/app`** (`platform/docs/architecture.md` section 6.6): ONE config file, `app/firesio.server.ts` (`createFiresio({ identity, plans, members, schema, ... })`, only what differs from the preset's defaults), the Shopify auth routes, the embedded `/app` shell (`middleware = [firesio.adminMiddleware]`, loaders use `firesio.from(context)`), the public pages, the catalogues of the app's own (plans, roles, the plans page's entitlement names) and one-line routes that mount `@firesio/app/ui/*` pages. Money, plans and billing, notifications and push, support, members, content, AI, the webhook inbox and GDPR purge, the Admin GraphQL client, the portal outbox, the guard, the Worker's `queue`, `scheduled` and `email` handlers and the AdminApi are **the preset's and the package's**: fix them in the `platform` repo, never copy them here. Every option, default and binding the preset reads: `node_modules/@firesio/app/src/preset/README.md`. Design: `platform/docs/architecture.md` (sections 4 to 8, 6.5 and 6.6); the template's task list: `platform/docs/tickets/13-template.md` and `17-firesio-app-preset.md`.

Derived apps replace the placeholders (`TODO:` values, the sample plans, the home page); `npm run check:placeholders` stops a deploy that still has them and is **expected to fail in this repo**. Never ask the owner for real values for a template placeholder.

## Commands

- `npm run verify`: typecheck, lint (it also enforces the layers) and the whole test suite. Run it before claiming anything done and before any push to `main`.
- `npm run new-app -- <slug> "<Name>"`: rename a fresh copy everywhere and list the Cloudflare resources to create (creates nothing).
- `npx vitest related --run <files>`; `npm run test:quick` for the inner loop.
- `npm run db:generate`: after changing `app/db/schema.ts` or a library's schema (`drizzle.config.ts` lists the package's schema files under `node_modules/@firesio/app/src/*/d1/schema.ts`). Check the SQL by hand: the app owns its migrations.
- `npm run cf:deploy`: verify, production build, D1 migrations, deploy. Never split build and deploy.
- `@firesio/app` and `@firesio/portal-contract` install from GitHub Packages with a read-only `NPM_TOKEN` (`.npmrc` references the variable, never a literal token).

## Layers (`eslint.boundaries.js`, proven by `tools/architecture/boundaries.test.ts`)

`entry (root, routes.ts, entry.*) -> routes -> composition (app/firesio.server.ts) -> core, db, i18n`; `components` and `i18n` are presentation helpers. The services, the adapters (D1, KV, R2, Shopify, Turnstile, Workers AI), the guard and the Worker's handlers are the preset's: the app has no `wiring/` and no `adapters/`.

- `app/firesio.server.ts`: THE composition file, the only call of `createFiresio`. It names the app's own values (identity, `PLANS`, `MEMBERS`, the Drizzle `schema` for the GDPR purge, labels, meters, metrics, content, notifications) and nothing the preset already does. Routes and the Worker reach the services only through `firesio` (`firesio.from(context)`, `firesio.services()`, whose `db` is Drizzle over `env.DB` typed by the app's `schema`); the preset's runtime is the one place that reads the clock and mints ids.
- `app/core/`: the app's declarations and pure helpers. Imports only `core`; time, ids, randomness and secrets are arguments. No React, no `fetch`.
- `app/db/`: the app's own Drizzle tables. Each table keyed by `shop` is erased on `shop/redact` without being listed anywhere; a table keyed by another column goes in `purge.shopScoped`, one that must survive in `purge.keep` (see the preset's README).
- `app/routes/`: thin. Read input, call a use case or a library route module, return. Never build a service.
- `workers/app.ts`: `fetch` (React Router) plus `queue`, `scheduled`, `email` delegating to `firesio` and `export const AdminApi = firesio.AdminApi` (the portal binds that name).
- Caps: a file at most 400 lines, a function at most 40 (lint). No `as`, no `any`, no `@ts-ignore`, no `Date.now`, `new Date()`, `crypto.randomUUID` or `Math.random` outside tests. No mutable module state (an isolate serves many shops).

## Shopify and the portal

- **Never write Shopify code from memory.** Use the `shopify-plugin:*` skills (search the docs, write, validate). Admin UI is Polaris web components, never Tailwind or hand-rolled CSS. Public pages use the SCSS tokens; a stylesheet is loaded by exactly one layout's `links()`.
- Webhooks: Shopify's `authenticate.webhook` verifies the HMAC (a bad signature stays a 401), then `firesio.webhook(hook)` puts ONE durable message on the queue and answers 2xx for the topics the preset owns (`firesio.handles`: uninstall and the three GDPR ones); the request writes nothing to D1 (`routes/webhooks/receive.ts`). A topic of the app's own is a key of the `webhooks` option (same queue, same inbox, deduped by the webhook id). The consumer (`firesio.queue`) admits, claims, runs, settles.
- The install is recorded ONLY in `afterAuth` (the preset's `shopifyApp(...)`, `firesio.shopify`): token exchange means there is no OAuth callback. The shop row and its `shop.*` event are one D1 batch.
- Events to the portal go through the D1 outbox and the cron `drain` (`firesio.scheduled`); a portal problem never fails a merchant's request. An event id may hold only letters, digits, `_` and `-`. `appSlug` is our own name (`core/identity.ts`, passed as `identity`), never Shopify's app id.
- Commands come from the portal to the `AdminApi` entrypoint (`firesio.AdminApi`: `shops`, `billing`, and `support` while support is on): validated by the contract, decided by the app, idempotent.
- Rate limits fail CLOSED (the preset's `adapters/rate-limit.ts`: a missing or failing binding denies). KV is never relational truth. A shop out of the shop-scoped row is a 404 or empty, never another shop's data.

## Cloudflare invariants

- `env` comes from `cloudflare:workers` (`firesio.services()` reads it), never from a destructured `ctx`. No floating promises: await, or `waitUntil`.
- **Named-environment bindings are not inherited**: re-declare every one under `env.production`. `scripts/wrangler-bindings.test.mjs` compares the two lists.
- Do not raise `compatibility_date` to 2026-11-17 or later without testing (the new module registry becomes the default).
- A push to `main` may deploy production (Workers Builds) **without** running `verify`: run it first.

## No Cheating: banned, always

- No faking, stubbing, hardcoding or mocking a result so code, tests, types or builds appear to pass.
- No deleting, `.skip`-ing, weakening or commenting out tests, assertions, type checks, lint rules or CI gates. Never `--no-verify`.
- No swallowing errors, `as any`, `@ts-ignore`, `eslint-disable` to hide a real problem.
- Never claim "done" without running it and seeing the real result. Report failures with the real output. Say what is partial.

## Testing

Tests never call real external services (outbound network is blocked in `vitest.config.ts`); bindings run for real in workerd. Every query needs a test proving it cannot read another shop's row; every webhook consumer needs a duplicate-delivery test. A test that touches a binding runs in workerd; call `setupTestDatabase()` at the top of the file. Details: `.claude/rules/testing.md`.

## Where to look

| Area | Rule (auto-loads) | Reference |
|---|---|---|
| Any code: layers, types, patterns | `core` | |
| Tests | `testing` | |
| D1, migrations | `data` | |
| Workers, wrangler, queues, cron, deploy | `cloudflare` | `docs/OPERATIONS.md`, `docs/webhooks.md` |
| Embedded admin pages (Polaris) | `shopify-and-ui`, `polaris-app-home`, `polaris-dashboard` | `docs/polaris-admin-guide.md`, `docs/polaris/` |
| Public pages / SCSS | `styling` | |
| Shopify API behaviour | | `docs/shopify-api-invariants.md` |
| Adopting the template | | `docs/ADOPTING_THE_TEMPLATE.md`, `CHANGELOG.md`, `template-files.json` |
