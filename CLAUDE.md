# Claude Code contract

Single source of truth for working in this repo. This repo is set up for Claude Code only.

**This file stays short on purpose.** Detail lives in `.claude/rules/*.md` (each carries `paths:` frontmatter, so it loads only when you read or edit a matching file), in skills (`agent-skills/`, linked into `.claude/skills/` by `npm run setup:skills`) and in `docs/` (never auto-loaded; search with `rg`).

## What this repo is

A **template**, and since roadmap step 13 a **thin shell on the `@firesio/*` packages**: Shopify auth and the embedded `/app` shell, the shop lifecycle, wiring, the catalogues (plans, roles, notifications, texts, metrics) and two-line routes that mount `@firesio/app-ui` pages. Money, plans and billing, notifications and push, support, members, content, AI, the webhook inbox and GDPR purge, the Admin GraphQL client, the portal outbox and the AdminApi frame are **libraries**: fix them in the `platform` repo, never copy them here. Design: `platform/docs/architecture.md` (sections 4 to 8 and 6.5); the template's task list: `platform/docs/tickets/13-template.md`.

Derived apps replace the placeholders (`TODO:` values, the sample plans, the home page); `npm run check:placeholders` stops a deploy that still has them and is **expected to fail in this repo**. Never ask the owner for real values for a template placeholder.

## Commands

- `npm run verify`: typecheck, lint (it also enforces the layers) and the whole test suite. Run it before claiming anything done and before any push to `main`.
- `npm run new-app -- <slug> "<Name>"`: rename a fresh copy everywhere and list the Cloudflare resources to create (creates nothing).
- `npx vitest related --run <files>`; `npm run test:quick` for the inner loop.
- `npm run db:generate`: after changing `app/adapters/db/schema.ts` or a library's schema. Check the SQL by hand: the app owns its migrations.
- `npm run cf:deploy`: verify, production build, D1 migrations, deploy. Never split build and deploy.
- `@firesio/*` install from GitHub Packages with a read-only `NPM_TOKEN` (`.npmrc` references the variable, never a literal token).

## Layers (`eslint.boundaries.js`, proven by `tools/architecture/boundaries.test.ts`)

`entry (root, routes.ts, entry.*) -> routes -> wiring -> adapters -> core`; `components` and `i18n` are presentation helpers.

- `app/core/`: pure. Decisions, ports, catalogues, use cases. Imports only `core`; time, ids, randomness and secrets are arguments. No React, no `fetch`.
- `app/adapters/`: THE one adapters folder (D1, KV, R2, Shopify, Turnstile). Imports `core`. Raw SQL with bound values; every query is keyed by `shop`.
- `app/wiring/`: the composition root. The ONLY place that picks adapters, reads the clock (`Date.now`, `new Date()`) and mints ids (`crypto.randomUUID`); lint bans them elsewhere. Entry points call `services()`.
- `app/routes/`: thin. Read input, call a use case or a library route module, return. Never import an adapter.
- `workers/`: the Worker's handlers (`fetch`, `scheduled`, `queue`, `email`) and `AdminApi`; they build services and hand over.
- Caps: a file at most 400 lines, a function at most 40 (lint). No `as`, no `any`, no `@ts-ignore`. No mutable module state (an isolate serves many shops).

## Shopify and the portal

- **Never write Shopify code from memory.** Use the `shopify-plugin:*` skills (search the docs, write, validate). Admin UI is Polaris web components, never Tailwind or hand-rolled CSS. Public pages use the SCSS tokens; a stylesheet is loaded by exactly one layout's `links()`.
- Webhooks: verify the HMAC, put ONE durable message on the queue, answer 2xx; the request writes nothing to D1 (`routes/webhooks/receive.ts`). The consumer admits, claims, runs, settles (`core/webhooks/consume.ts`). A bad signature stays a 401.
- The install is recorded ONLY in `afterAuth` (`core/shops/after-auth.ts`): token exchange means there is no OAuth callback. The shop row and its `shop.*` event are one D1 batch (`enqueueStatement`).
- Events to the portal go through the D1 outbox and the cron `drain`; a portal problem never fails a merchant's request. An event id may hold only letters, digits, `_` and `-` (`idPart` in `core/shops/lifecycle.ts`). `appSlug` is our own name (`core/identity.ts`), never Shopify's app id.
- Commands come from the portal to `workers/admin-api.ts` (`shops`, `billing`): validated by the contract, decided by the app, idempotent.
- Rate limits fail CLOSED (`adapters/rate-limit.ts`). KV is never relational truth. A shop out of the shop-scoped row is a 404 or empty, never another shop's data.

## Cloudflare invariants

- `env` comes from `cloudflare:workers` (`services()`), never from a destructured `ctx`. No floating promises: await, or `waitUntil`.
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
