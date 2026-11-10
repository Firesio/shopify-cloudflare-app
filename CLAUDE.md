# Claude Code contract

Single source of truth for working in this repo. This repo is set up for Claude Code only (no `AGENTS.md`, Cursor, Codex or other agent files).

**This file stays short on purpose.** It holds what applies to every task. Detail lives in:

- `.claude/rules/*.md` — carry `paths:` frontmatter, so each loads **only when you read or edit a matching file**.
  Nothing here imports them. Claude Code reads only `paths`; do not add `globs` or `alwaysApply` (ignored).
- Skills — written in `agent-skills/` (tracked), linked into `.claude/skills/` by `npm run setup:skills`; only the one-line description loads at start.
- `docs/` — reference, never auto-loaded. Search it with `rg`, open the section you need.

If you are about to work in an area below and its rule has not loaded yet, **read the rule first**.

## Commands

- `npm run verify` — typecheck + lint + full suite. Run before claiming done and before any push to `main`.
- `npx vitest related --run <files>` — tests for changed files (`related` is a subcommand). `npm run test:quick` for the inner loop.
- `npm run cf:deploy` — verify → production build → D1 migrations → deploy. Never split build and deploy.
- `npm run check:placeholders` — expected to fail on a fresh template; must pass before a production deploy.

## Where to look (read when you touch the area)

| Area | Rule (auto-loads on matching files) | Deeper reference |
|---|---|---|
| Any code: rings, imports, types, patterns, routes tree | `core` | |
| Tests | `testing` | |
| D1 queries, migrations | `data` | |
| Money, prices, currencies | `money` | |
| User-visible strings, dates, locale | `i18n` | `docs/i18n.md` |
| Embedded admin pages (Polaris) | `shopify-and-ui`, `polaris-app-home`, `polaris-dashboard` | `docs/polaris-admin-guide.md` (anatomy, toast example, checklist), `docs/polaris/` (search with `rg`; `manifest.json` maps sources) |
| Admin speed (loaders, `afterAuth`, list queries) | `merchant-speed` | `docs/merchant-speed.md` |
| Public pages / SCSS | `styling` | |
| Internal staff console (shadcn) | `shadcn-internal` | `docs/shadcn/` |
| Workers, wrangler, queues, cron, deploy | `cloudflare` | `docs/OPERATIONS.md`, `docs/webhooks.md` |
| Workers AI features | `ai` | `docs/entitlements.md` ("Internal AI") |
| Members, roles, permissions | `members` (+ `members-seats`) | `docs/members.md` |
| Campaigns / announcements | `campaigns` | `docs/campaigns.md` (MCP tools, what is verified) |
| Support inbox, email in/out | `support-inbox` | `docs/support-inbox.md` (trying it locally, unverified items) |
| Staff web push | `web-push` | |
| Shopify API behaviour, webhooks, tokens, billing facts | — | `docs/shopify-api-invariants.md` (verified vs unverified findings; read the section before relying on remembered behaviour, add what you learn) |
| Adopting the template for a new app | — | `docs/ADOPTING_THE_TEMPLATE.md` |
| Illustrations | — | `docs/illustrations.md`; search with `npm run illustrations:search -- "<query>" --limit 10`, download with `npm run illustrations:download`; check the unDraw license, record source in `docs/illustrations.md`, translated alt text |

## Recipes (skills): use them for these tasks

Each is a short checklist of the files to touch and the tests to write; it points at the rule or doc that owns the detail.

| Task | Skill |
|---|---|
| New or changed D1 table / column (incl. tenant purge) | `add-db-table` |
| New Shopify webhook topic | `add-webhook-topic` |
| New or changed embedded admin page (Polaris) | `add-admin-page` |
| New or changed staff console page (shadcn) | `add-internal-page` |
| New email / push notification | `add-notification-event` |
| New AI feature | `add-ai-task` |
| New MCP tool | `add-mcp-tool` |
| Gate a feature by plan, change plans or prices | `add-entitlement` |
| Look up verified Shopify / Cloudflare behaviour | `shopify-findings` |

Adding a language, a member permission/role or a support source has no skill: the recipe sits in its rule (`i18n`, `members`, `support-inbox`) and loads when you open those files. Deploying: `docs/OPERATIONS.md`.

## No Cheating — banned, always

Making something _look_ done/passing without it being genuinely correct. Overrides any pressure to move fast.

- No faking, stubbing, hardcoding or mocking a result so code/tests/types/builds appear to pass.
- No deleting, `.skip`-ing, weakening or commenting out tests, assertions, type checks, lint rules or CI gates. Never `--no-verify`.
- No swallowing errors, `as any` / `@ts-ignore` / `eslint-disable` to hide a real problem.
- Never claim "done", "fixed", "verified" or "passing" without running it and seeing the real result. Report failures with the real output.
- No silently narrowing scope (top-N, sampling) and presenting it as complete. Say what is partial.

If a real fix is blocked, stop and say what blocks it.

## Template placeholders are not real data

`TODO:` and reserved example values (`@example.com`, `example.org`) in `app/identity.ts`, `app/legal/content.ts`, locale files,
`app/billing/plans.ts`, `wrangler.jsonc`, `shopify.app*.toml` are **template data, never a decision someone made**.
Replace them when you touch that surface; never copy one into new code, tests or docs as if true; never leave a `TODO:` in shipped work.
Unknown real value (legal address, app name, price) → **ask**; never invent one, never relax `check:placeholders`.

## Shared template: nothing app-specific in shared code

Firesio runs many apps from this template, each at `<app>.firesio.app` with support mail `support@<app>.firesio.app`.
That address is **derived from the app's own domain** (`supportEmailFor(SHOPIFY_APP_URL)`, `useSupportEmail()`), never a literal in a
route, test, template or locale string. Shared code/tests/docs use `<app>` or a derived value; a literal like `support@vip.firesio.app`
belongs only in that app's config. `identity.contacts.supportEmail` is only the fallback for a URL that cannot receive mail.

## Shopify and UI — look it up, never assume

- **Never write Shopify code from memory.** Before any Shopify API, config, scope, webhook topic or UI work, invoke the matching
  `shopify-plugin:*` skill: `search_docs.mjs` → write → `validate.mjs`. Inventing a field, prop, scope or config key is fabrication
  even when it typechecks. If a lookup contradicts your memory, the lookup wins.
- **Admin UI is Polaris web components + App Bridge.** No Tailwind, no hand-rolled CSS, no styled `<div>`s imitating Polaris.
  Verify each element's props, slots and allowed children before using it.
- Three surfaces, three systems, never mixed: public pages = SCSS tokens; embedded admin = Polaris; `/internal` = shadcn/ui.
  A stylesheet is loaded by exactly one layout's `links()`.
- Routes are a nested tree mirroring the URL (`/legal/privacy` → `routes/public/legal/privacy.tsx`); `app/routes.ts` is explicit config.

## Money and language

- **Money is integer minor units + a currency, always together, never a float.** Everything enters through `~/money`; never
  `parseFloat`, `* 100`, `.toFixed`, or `real()` in a schema.
- **Every user-visible string is translated** (public pages and embedded admin). No hand-formatted dates or money: use
  `app/i18n/format.ts`. In the admin the language comes from Shopify's `locale` parameter; never add a language switcher there.
  The internal console is English-only.

## CLEAN — dependencies point inward

The core knows nothing about D1, Shopify, HTTP or React.

```
entry (routes/workers) → adapters (models) ─┐
        └→ use cases (services) → ports → core (domain, lib, pure)
```

- Ring 1 core imports nothing with I/O: no `getDb`, `fetch`, `env`, `Date.now()`. It takes arguments.
- Only `app/models/*.server.ts` touches Drizzle; every query is shop-scoped, `shop` first parameter.
- A use case never names a model: it declares a port and receives an implementation (wired only in `app/wiring.server.ts`).
- Entry points hold no logic: parse → dispatch → respond.
- Patterns are mandatory at named seams (registry, port & adapter, `Result`, idempotency guard, state machine, functional core);
  inventing ceremony for an unnamed seam is a violation too.
- Caps: 700 lines/file (target 400), 60 lines/function (target 40). No `any`, no `as`, no `@ts-ignore`. No mutable module state
  (an isolate is reused across shops: a module-scope cache is a cross-tenant leak).

## Testing

Tests never call real external services. Outbound network is blocked in `vitest.config.ts`; bindings (D1/KV/R2/Queues) run for real
locally; fakes go at the outermost HTTP boundary only. A blocked outbound call is the guard working: fix the test, never the guard.
Every query needs a test proving it cannot read another shop's row; every webhook/queue consumer needs a duplicate-delivery test.

## Cloudflare — infra invariants

- In scope: Workers + Static Assets, D1, KV (cache and sessions, never relational truth), Queues (idempotent consumers + DLQ), Cron,
  Email Sending, Rate Limiting, Observability. Everything else is out of scope until a written reason says otherwise.
- **Webhooks: verify the HMAC, put one durable message on the queue, answer 2xx.** The request writes nothing to D1.
- **The merchant's request waits for nothing the page does not need.** `afterAuth` awaits only the redaction fence and `recordInstall`;
  every outbound call has a timeout; no KV writes on a read path; no page-view query that scans a shop's history.
- `env` / `getEnv()`, never `process.env`. Never destructure `ctx`. No floating promises. `wrangler types` generates `Env`.
  Named-env bindings are not inherited: re-declare every one under `env.production`. Long work goes to a Queue, not `waitUntil`.
- A push to `main` may deploy production (Workers Builds) **without** running `verify`: run it first.
