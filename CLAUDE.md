# Claude Code contract

Single source of truth for working in this repo. This repo is set up for Claude Code only.

**This file stays short on purpose.** Detail lives in `.claude/rules/*.md` (each carries `paths:` frontmatter, so it loads only when you read or edit a matching file), in skills (`.claude/skills/`) and in `docs/` (never auto-loaded; search with `rg`).

## What this repo is

A **template**, and the **minimal app on `@firesio/app`** (design: `docs/architecture.md` section 6.6 in the Firesio platform repo): ONE config file, `app/firesio.server.ts` (`createFiresio({ identity, plans, members, schema, ... })`, only what differs from the preset's defaults), the Shopify auth routes, the embedded `/app` shell (`middleware = [firesio.adminMiddleware]`, loaders and actions are `firesio.loader(...)` / `firesio.action(...)`), the public pages, the catalogues of the app's own (the plans with their features, the roles) and one-line routes that mount `@firesio/app/ui/*` pages (and the shell around them, `@firesio/app/ui/shell`: `EmbeddedProvider`, the error boundaries, `describeRequestError`). Money, plans and billing, notifications and push, support, members, content, AI, the webhook inbox and GDPR purge, the Admin GraphQL client, the portal outbox, the guard, the Worker's `queue`, `scheduled` and `email` handlers and the AdminApi are **the preset's and the package's**: fix them in the `platform` repo, never copy them here. Every option, default and binding the preset reads: `node_modules/@firesio/app/src/preset/README.md`. The wider design (events, commands, libraries, the portal) is `docs/architecture.md` sections 4 to 8 in the Firesio platform repo, which a derived app does not carry: everything an agent needs to act is in this repo and in the package's README.

Derived apps replace the placeholders (`TODO:` values, the sample plans, the home page); `npm run check:placeholders` stops a deploy that still has them and is **expected to fail in this repo**. Never ask the owner for real values for a template placeholder.

## Commands

- `npm run verify`: typecheck, lint (it also enforces the layers) and the whole test suite. Run it before claiming anything done and before any push to `main`.
- `npm run new-app -- <slug> "<Name>"`: rename a fresh copy everywhere and list the Cloudflare resources to create (creates nothing).
- `npx vitest related --run <files>`; `npm run test:quick` for the inner loop.
- `npm run db:generate`: after changing `app/db/schema.ts` or a library's schema (`drizzle.config.ts` lists the app's schema plus `firesioSchemaPaths()` from `@firesio/app/preset/schema`). Check the SQL by hand: the app owns its migrations, and a derived app holds rows (a renamed table is `ALTER TABLE ... RENAME TO`, never a drop and a create; `.claude/rules/data.md`).
- `npm run cf:deploy`: verify, production build, D1 migrations, deploy. Never split build and deploy.
- `@firesio/app` and `@firesio/portal-contract` install from GitHub Packages with a read-only `NPM_TOKEN` (`.npmrc` references the variable, never a literal token).

## Layers (`eslint.boundaries.js`, proven by `tools/architecture/boundaries.test.ts`)

`entry (root, routes.ts, entry.*) -> routes -> composition (app/firesio.server.ts) -> core, db, i18n`, and `routes -> ai -> core`; `components` and `i18n` are presentation helpers (`app/i18n/` and `app/ai/` are layers a derived app fills: the template has no file in them). The services, the adapters (D1, KV, R2, Shopify, Turnstile, Workers AI), the guard and the Worker's handlers are the preset's: the app has no `wiring/` and no `adapters/`.

- `app/firesio.server.ts`: THE composition file, the only call of `createFiresio`. It names the app's own values (identity, `PLANS` (the catalogue of `core/plans.ts`, built here with the counts its usage meters read from the services), `MEMBERS`, the Drizzle `schema` for the GDPR purge, settings, metrics, content, `notify`) and nothing the preset already does. Routes and the Worker reach the services only through `firesio` (`firesio.loader(permission?, handler)` and `firesio.action(...)`, whose handler gets `request`, `params`, `shop`, `member`, `admin`, `services` and `ai`; `firesio.from(context)` is the long form; `firesio.job({ shop }, work)` outside a request; a service of the app's own that every route needs bound to the shop goes in `createFiresio(...).withServices(({ services, shop, ai }) => ({ ... }))`, once, and then arrives in the same bag; a permission for a whole group of pages goes in the `access` option (a list of rules: `[{ path: "/app/settings", needs: "settings:manage" }]`, or `read` and `write` apart), a stricter one for one action in `firesio.action(permission, handler)`; `services.db` is Drizzle over `env.DB` typed by the app's `schema`); the preset's runtime is the one place that reads the clock and mints ids.
- `app/core/`: the app's declarations and pure helpers. Imports only `core`; time, ids, randomness and secrets are arguments. No React, no `fetch`. Plans are declared ONCE, in `core/plans.ts` (`definePlans({ features, plans })`: the plans page, its comparison rows and its usage meters are generated from it); a number a feature counts from the database is an argument too (`planCatalogue({ openTickets })`). Every period boundary is UTC; a shop's time zone only formats what a person reads.
- `app/db/`: the app's own Drizzle tables. Each table keyed by `shop` is erased on `shop/redact` without being listed anywhere; a table keyed by another column goes in `purge.shopScoped`, one that must survive in `purge.keep` (see the preset's README).
- `app/ai/`: the app's AI features, one function each that takes the shop's `ai` (`FiresioAi`) as an argument: its prompt and its call. Never imports `firesio` or `db`, so its test passes `fakeAi()`.
- `app/routes/`: thin. Read input, call a use case or a library route module, return. Never build a service.
- `workers/app.ts`: `fetch` (React Router) plus `queue`, `scheduled`, `email` delegating to `firesio` and `export const AdminApi = firesio.AdminApi` (the portal binds that name).
- Caps: a file at most 400 lines, a function at most 40 (lint). No `as`, no `any`, no `@ts-ignore`, no `Date.now`, `new Date()`, `crypto.randomUUID` or `Math.random` outside tests. No mutable module state (an isolate serves many shops).

## Shopify and the portal

- **Never write Shopify code from memory.** Use the `shopify-plugin:*` skills (search the docs, write, validate). Admin UI is Polaris web components, never Tailwind or hand-rolled CSS. Public pages use the SCSS tokens; a stylesheet is loaded by exactly one layout's `links()`.
- Webhooks: `routes/webhooks/receive.ts` is `firesio.webhookRoute` (its `action` is `firesio.webhook(request)` for every delivery and every topic, with the RAW `Request`; its `loader` answers a GET 405); never hand the preset the result of `authenticate.webhook`. Why, the consumer and how to add a topic: `docs/webhooks.md`. Both tomls must subscribe the same topics at the same `/webhooks/...` URIs (`npm run check:placeholders` checks it, and the `[build]` flags `shopify app config link` drops).
- The install is recorded ONLY in `afterAuth` (the preset's `shopifyApp(...)`, `firesio.shopify`): token exchange means there is no OAuth callback. The shop row and its `shop.*` event are one D1 batch.
- Events to the portal go through the D1 outbox and the cron `drain` (`firesio.scheduled`); a portal problem never fails a merchant's request. An event id may hold only letters, digits, `_` and `-`. `appSlug` is our own name (`core/identity.ts`, passed as `identity`), never Shopify's app id.
- The portal learns about the app from ONE pull request to the Firesio platform repo (a declaration and a service binding to `<slug>-production`, `entrypoint: "AdminApi"`); nothing in this repo registers it. The steps are in `docs/ADOPTING_THE_TEMPLATE.md` section 5; until it is merged and deployed the portal stores none of the app's events.
- Commands come from the portal to the `AdminApi` entrypoint (`firesio.AdminApi`: `shops`, `billing`, and `support` while support is on): validated by the contract, decided by the app, idempotent.
- Rate limits fail CLOSED (the preset's `adapters/rate-limit.ts`: a missing or failing binding denies). KV is never relational truth. A shop out of the shop-scoped row is a 404 or empty, never another shop's data.

## AI

- The AI is the preset's: `ai` in a route handler (`firesio.from(context).ai`, `firesio.job(...)`) is the shop's AI over Cloudflare (`node_modules/@firesio/app/src/preset/README.md`, section "AI"). Write a feature with the AI SDK's shapes: `ai.text({ feature, system, prompt })`, `ai.object({ schema, prompt })`, `ai.stream({ prompt }).toTextStreamResponse()`, `ai.decide(state, questions)` (Clef: yes/no, one of several, a score; never throws, `null` per unanswered question), `ai.model(feature)` for `generateText`/`streamText` with tools, `ai.provider()` for embeddings and images.
- **Never pick a model in code by default.** Cloudflare's Auto Router chooses (Workers AI models only); a feature that needs a fixed model is one line in `app/firesio.server.ts` (`ai: { models: { "<feature>": "@cf/..." } }`). Name every call's `feature` (`area.what`): it is the log line's name and the key of an override.
- Fence what a merchant, a shopper or a mail wrote: `untrustedBlock(label, text)` in the prompt and `withGuard(...)` on the system message (`@firesio/app/ai`). What a model decides is still checked by code (a schema, a threshold, a person reading the draft).
- Merchant-facing AI needs a policy: `ai: { gate }` (`quotaGate`, `merchantsOnly`, `composeGates` from `@firesio/app/ai`) for which plan has AI and how much. A refusal throws an `AiError`; tell "upgrade" from "wait" with `isAiRefusal(error)` and `error.reason` (`forbidden`, `quota_exceeded`). A provider failure must never block the merchant's own action.
- Prompts are not stored in AI Gateway's log (`collectLog: false`, the default): they carry customers' words a `shop/redact` must be able to erase. Do not turn it on in production.

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
| Embedded admin pages (Polaris) | `shopify-and-ui`, `polaris-app-home`, `polaris-dashboard` | `docs/polaris-admin-guide.md` |
| Public pages / SCSS | `styling` | |
| Shopify API behaviour | | `docs/shopify-api-invariants.md` |
| Adopting the template | | `docs/ADOPTING_THE_TEMPLATE.md`, `CHANGELOG.md`, `template-files.json` |
