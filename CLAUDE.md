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

## Layout: the standard every app follows

This is the shape of EVERY Firesio app, the template's and a large one's alike: a derived app adds the folders below as its features need them and never invents another (a file in a folder the table does not know fails lint, `no-unknown-files`). Who may import whom is `eslint.boundaries.js`, the import bans are `eslint.config.js`, and `tools/architecture/boundaries.test.ts` proves each row with a probe file (feature sub-folders included), linted by the repo's whole config with only the rule under test and no type-aware parsing, in a copy of the layout in a temporary directory outside the repo (`tools/architecture/probe-world.ts`): a probe never writes into `app/`, so a test or tool that crawls the sources never sees one, and a new probe of an app's own rule goes there too. The template has no file yet in `app/adapters/`, `app/wiring/`, `app/notifications/`, `app/ai/` and `app/i18n/`: they are the layers a derived app fills. The preset's own services, adapters, guard and Worker handlers stay in `@firesio/app`; never copy one here.

| Folder | Holds | May import (of the app) |
|---|---|---|
| `app/firesio.server.ts` | THE composition file, the only call of `createFiresio` (lint bans it anywhere else but a test): the app's values (identity, `PLANS` and `counts`, `MEMBERS`, `schema`, settings, `paths`, `retention`, metrics, content, `notify`, `access`) and, plugged in, the app's own services (`.withServices(...)`) and handlers (`webhooks`, `queues`, `deadLetterQueues`, `cron`, `lifecycle`, `around`), built in `app/wiring/`. Only what differs from the preset's defaults. | core, db, i18n, adapters, wiring, notifications |
| `app/core/*.ts` | The app-wide declarations (`identity.ts`, `plans.ts`, `members.ts`, `settings.ts`, `paths.ts`, `retention.ts`, `api-version.ts`, `polaris.ts`) and pure helpers of the whole app (the security headers, the install target, the embedded entry check, the error log line). | core |
| `app/core/<feature>/` | A feature's domain, pure: its types, rules and zod schemas of its input; its PORTS (interfaces of what it reads, writes or calls: `OrdersRepo`, `CatalogApi`); its USE CASES, functions handed their ports and the time, ids and secrets they need, answering a result value (a union, never a thrown refusal); its `vocabulary.ts`, the value lists its rows store (below). Tests beside each file, in Node. | core |
| `app/db/` | Drizzle tables, nothing else. `schema.ts` is the ONE module handed to `createFiresio({ schema })` (every table with a `shop` column is erased on `shop/redact`) and listed first in `drizzle.config.ts`; once there are several features, one file per feature (`app/db/<feature>.ts`) re-exported by `schema.ts`. | db, core's `vocabulary.ts` files |
| `app/adapters/<feature>/` | The implementations of a feature's ports: Drizzle over `services.db`, a raw `env.DB` batch when a write goes with a portal outbox statement (`.claude/rules/data.md`), KV, R2 and Queue bindings, the Admin GraphQL documents (through the `admin` it is given), outside HTTP (through a `fetch` it is given). Each takes what it uses as arguments (the database, the binding, the shop): no Worker env of its own, no React. Tests `*.workerd.test.ts` against the real local bindings, each with the test that it cannot read another shop's row. | adapters, core, db |
| `app/wiring/<feature>.ts` | What the composition file plugs in, handed the part of the preset's services it uses as arguments (`{ db, shop }`, not the whole bag, so the `withServices` factory and a webhook or cron handler, which get different service types, call it alike): the feature's services for one shop (`ordersFor({ services, shop })`, bound adapters into its use cases, spread into `withServices`) and its handlers: `webhooks` topics, `queues` and `deadLetterQueues` handlers, `cron` steps, `lifecycle` hooks, the `notify` hooks that read tables (`mailCopies`, `textsFor`, `consent`, `can`, `look`), an `around` for an app with its own request context. It never imports `firesio` (the composition file imports it: TS7022). | wiring, core, db, adapters, ai |
| `app/notifications/` | The app's own messages (`defineMessages` of `@firesio/app/notify`), their texts per language and their mail templates (a `template` may be React Email). | notifications, core, i18n, components |
| `app/ai/<feature>.ts` | One function per AI feature, handed the shop's `ai`: its prompt and its call (`fakeAi()` in its test). | ai, core |
| `app/i18n/` | The app's words per language: label objects of its own pages and the `labels.*` of `createFiresio`. | i18n, core |
| `app/components/<feature>/` | Presentational React (props in, markup out) and the client hooks of those components. | components, i18n, core |
| `app/routes/` | Thin route modules; the tree mirrors the URL and `app/routes.ts` (explicit config) lists each. `app/` the embedded admin (`app/<feature>/...`; a page of the package is a one-line re-export, `export { default, loader, action } from "@firesio/app/ui/support/thread"`, and the support staging route is one too), `public/`, `auth/`, `webhooks/` (one receiver), `support/` (the signed file link), `proxy/` (an app proxy: `authenticate.public.appProxy`, then `firesio.check`), `extensions/` (an extension's backend: `authenticate.pos` / `authenticate.public.customerAccount`, then `firesio.check`), `healthz`. A loader or action is `firesio.loader(permission, handler)`: it reads the input, calls a use case from the bag (`services`, or the app's own from `withServices`), returns. It never builds a service and never queries a table (no `db`, `adapters` or `wiring` import). | routes, composition, components, i18n, core, ai |
| `app/root.tsx`, `app/routes.ts`, `app/entry.*` | The document, the route table, the client and server entries. | routes, composition, components, i18n, core |
| `app/test/` | Shared test support, test-only: the database and env helpers (`setupTestDatabase`), the e2e server build, and an app's fixtures and worlds by feature (`app/test/<feature>/`: helpers that seed its tables, build its adapters and wiring, call its routes), so a helper two tests share is never copied. It reaches what a test reaches; nothing but a test or test support imports it (lint, every layer probed), so none of it reaches the Worker's bundle. A helper that reads `cloudflare:test` serves workerd tests only. | test-support, composition, entry, core, db, adapters, wiring, notifications, components, i18n, routes, ai, workers |
| `app/styles/` | SCSS of the public pages (one layout's `links()` loads each). | |
| `workers/` | `app.ts`: `fetch` (React Router) plus `queue`, `scheduled`, `email` delegating to `firesio`, `export const AdminApi = firesio.AdminApi`; a Durable Object class is `workers/<name>.ts`, exported from `app.ts`, and reaches the services through `firesio.job(...)`. | workers, composition, core, ai |
| `tools/architecture/` | Tests that hold the repo to this table, the schema to the migrations, `wrangler.jsonc` to the crons, `vite.config.ts` to one copy of the package and to the Worker across a dev-server restart. | tools |
| `drizzle/`, `extensions/`, `public/`, `scripts/` | The migrations (`npm run db:generate`), the Shopify extensions, static files, Node scripts. | (not in the table) |

The bans every row carries (lint): a vocabulary imports nothing and declares no function or class; core imports no React or router, no `fetch`, no query builder (`drizzle-orm`), no Worker env (`cloudflare:*`), no value of the preset (`@firesio/app`; a type is fine), no package page (`@firesio/app/ui/*`), no D1 adapter or preset part (`@firesio/app/*/d1`, `/preset/*`); adapters and wiring import no React and no Worker env (they are handed bindings); components, words, messages and AI features import no query builder and no Worker env. Everywhere outside tests: no `Date.now`, `new Date()`, `crypto.randomUUID`, `Math.random` (the preset's `services.runtime`), no `as`, `any` or `@ts-ignore`, a file at most 400 lines and a function at most 40. No mutable module state (an isolate serves many shops).

**A value list core and db both need** (a status a CHECK constraint holds and the domain decides on) is declared ONCE, in the feature's vocabulary, `app/core/<feature>/vocabulary.ts` (`app/core/vocabulary.ts` for the whole app): `as const` lists and the types read from them, nothing else. It is the one file of core that db may import, and it imports nothing, not even core, and holds no function or class (lint, so no logic and no input reaches a table's DDL through it); core's rules and zod schemas (`z.enum(ORDER_STATUSES)`) import it like any core file. Never a copy in `app/db/` held equal by a test: one list cannot drift. The worked example, proved by `tools/architecture/vocabulary-recipe.test.ts` (the CHECK it writes, in SQLite) and `boundaries.test.ts` (who may import it):

```ts
// app/core/orders/vocabulary.ts
export const ORDER_STATUSES = ["open", "closed"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// app/db/orders.ts
import { sql } from "drizzle-orm";
import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ORDER_STATUSES } from "~/core/orders/vocabulary";

export const orders = sqliteTable(
  "orders",
  { id: text().primaryKey(), shop: text().notNull(), status: text({ enum: ORDER_STATUSES }).notNull() },
  // DDL binds nothing, so the values are inlined: the vocabulary's literals, never input.
  (table) => [check("orders_status", sql`${table.status} IN (${sql.raw(ORDER_STATUSES.map((status) => `'${status}'`).join(", "))})`)],
);
```

A value added to the list changes the CHECK, so `npm run db:generate` writes the migration (SQLite rebuilds the table: read the SQL, `.claude/rules/data.md`) and `schema-drift.test.ts` keeps the two in step.

**Reaching the services.** Routes, workers and wiring reach what the preset built only through `firesio` (or, in wiring, the `services` they are handed). `firesio.loader(permission?, handler)` / `firesio.action(...)`: the handler gets `request`, `params`, `shop`, `shopRecord` (the shop's row the guard already read for this request, `null` before it has one: never read it again), `member`, `admin`, `session`, `services`, `ai` and the app's own services from `withServices`; `firesio.from(context)` is the long form, `firesio.job({ shop }, work)` the same outside a request. A permission for a whole group of pages is the `access` option (`[{ path: "/app/settings", needs: "settings:manage" }]`, or `read` and `write` apart), a stricter one for one action `firesio.action(permission, handler)`. `services.db` is Drizzle over `env.DB` typed by `schema` (what an adapter is handed); `services.shopState(shop, row?)` / `services.shopStates(shops, rows?)` say where one or many shops stand (a job over a list reads the rows once, `services.shops.getMany(shops)`); an extension backend's `firesio.check(auth, { permission, record? })` answers the row it read. Plans are declared ONCE (`core/plans.ts`, `definePlans`); a number a meter counts from the database is the composition file's `counts`. Every period boundary is UTC; a shop's time zone only formats what a person reads.

**A feature grows by the same name in each layer.** `orders`: `app/core/orders/` (`vocabulary.ts` the statuses, `order.ts` the type and rules, `ports.ts` with `OrdersRepo`, `close-order.ts` the use case, each with its test); `app/db/orders.ts` (re-exported by `schema.ts`); `app/adapters/orders/d1-orders-repo.ts` (+ `.workerd.test.ts`); `app/wiring/orders.ts` (`ordersFor({ services, shop })` and `ORDERS_WEBHOOKS`); in `app/firesio.server.ts`, `createFiresio({ ..., webhooks: { ...ORDERS_WEBHOOKS } }).withServices(({ services, shop }) => ({ orders: ordersFor({ services, shop }) }))`; `app/routes/app/orders/list.tsx` (`firesio.loader("orders:view", ({ orders }) => orders.list())`) mounted in `app/routes.ts`; `app/components/orders/OrderTable.tsx`; the words in `app/i18n/orders.ts`. A page that reads one table is the same shape (an adapter and one line of `withServices`), never a query in the loader. One feature may use another's `core` (one domain); a rule two apps need goes to the package (platform repo), not into a shared folder here.

**Where a folder name a grown app may already have goes:** `domain/`, `lib/`, `schemas/`, `ports/`, a feature folder of pure code: `app/core/<feature>/`; use cases (`services/`, `use-cases/`): `app/core/<feature>/` (handed ports, so pure); `models/`, `repositories/`, `adapters/`, Shopify GraphQL clients, caches, mailers: `app/adapters/<feature>/`; `wiring/`, a composition root, a request context: `app/wiring/` and `app/firesio.server.ts`; `emails/`, `notifications/`, `templates/`: `app/notifications/`; `hooks/`: beside their components; `resources/` routes: under the surface their URL is in; what the package already does (money, plans and billing, members, support, notifications, the webhook inbox, GDPR, the Admin client, the guard, observability): the package's, configured in `app/firesio.server.ts`, with the app's own rules (a plan rule, a consent rule) as the option or hook the package offers.

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
