# Shopify Cloudflare App Template

The shell every Firesio Shopify app starts from, on **Cloudflare Workers** (React Router 7, D1, KV, R2, Queues, Cron, Email) and **`@firesio/app`**, one package with a preset
(`createFiresio`). The template is the minimal app of section 6.6 of the platform design (`docs/architecture.md` in the Firesio platform repo): one config file
(`app/firesio.server.ts`), `routes.ts` written by hand, a Worker entry of a few lines, one-line routes that mount the pages of
`@firesio/app/ui/*`, and what is Shopify's and the app's own (auth routes, the embedded `/app` shell, the public pages, the plans
and roles). Everything that two apps would copy (money, plans and billing, notifications and push, support, members, content, AI,
the webhook inbox and GDPR purge, the Admin GraphQL client, the portal outbox, the guard, the Worker's handlers and the AdminApi)
is the preset's. The design (sections 4 to 8, 6.5, 6.6) lives in the Firesio platform repo, which a derived app does not carry; every option and binding the preset reads is documented in `node_modules/@firesio/app/src/preset/README.md`.

Staff operate the app from the **portal**, not from the app: there is no staff console here. The app sends the portal events (install,
uninstall, plan changes, redactions, a daily snapshot) through a D1 outbox, and answers its commands through the `AdminApi` entrypoint the preset provides (`export const AdminApi = firesio.AdminApi` in `workers/app.ts`).

## Stack

| | |
|---|---|
| Runtime | Workers + Static Assets, React Router 7 (SSR, `future.v8_middleware`), Vite 8 |
| Shopify | `@shopify/shopify-app-react-router` (token exchange, App Store distribution), Polaris web components, App Bridge |
| Data | D1 (Drizzle: the preset's and the libraries' `/d1` schemas plus the app's own, in one migration history), KV (sessions), R2 (attachments) |
| Libraries | `@firesio/app` (the preset at the root; subpaths `core`, `money`, `plans`, `shopify`, `support`, `members`, `notify`, `content`, `ai`, `portal-client`, `ui/*`) and `@firesio/portal-contract` |
| Tests | Vitest 5 in workerd with real D1/KV/R2/Queues, Node for pure code, `node --test` for scripts |

## Start a new app

```bash
gh repo create my-new-app --template Firesio/shopify-cloudflare-app --private --clone
cd my-new-app
export NPM_TOKEN=...            # a read-only (read:packages) token for the @firesio packages (`@firesio/app`, `@firesio/portal-contract`); .npmrc only references it
npm install
npm run new-app -- repair-service-ops "Repair Service Ops"   # renames everything, lists the Cloudflare resources to create
cp .dev.vars.example .dev.vars   # then fill it in
npm run config:link:dev          # dev Shopify app (rewrites shopify.app.dev.toml: diff it)
npm run db:migrate:local
npm run dev
```

`new-app` creates nothing in Cloudflare or Shopify: it edits files (it also blanks both `client_id` values, which `config:link:*` fill in) and
prints the commands (D1, KV, R2, the webhook queue and its DLQ, secrets) and the portal registration. `npm run check:placeholders`
fails until every placeholder is replaced; that is its job.

## Register the app with the portal

Staff operate the app from the portal, which learns about an app from ONE pull request to the Firesio platform repo (the review is the
approval; there is no Register button):

1. `apps/portal/app/core/apps/declared-apps.ts`: an entry with the app's `slug` (the `appSlug` its events carry: `app/core/identity.ts`),
   `name`, `kind`, the `binding` key, and optionally `modules`, `links`, `staffPages`; add `campaigns: true` if the app adopts the
   `campaigns()` command group.
2. `apps/portal/wrangler.jsonc`: the service binding with that key at the top level AND under `env.production` (bindings are not
   inherited): `{ "binding": "<KEY>", "service": "<slug>-production", "entrypoint": "AdminApi" }`. `<slug>-production` is THIS repo's
   Worker name: the `name` in `wrangler.jsonc` (which `npm run new-app` sets to the slug) plus `-production`, the name `wrangler deploy` gives
   `env.production`. The binding key must also be known to the portal's `shell/apps/app-bindings.ts`.
3. After the portal deploys, its `*/5` cron reconciles the declaration into its `apps` table: the app's events are accepted within five
   minutes. Until then the portal shows the app as pending and stores none of its events.

The app's own half is already here: the `PORTAL_EVENTS` producer binding in `wrangler.jsonc` and `export const AdminApi = firesio.AdminApi`
in `workers/app.ts`.

## Layout

```
app/
  firesio.server.ts  THE glue: `createFiresio({ identity, plans, members, schema, ... })`, only what differs from the preset's defaults
  core/        the app's own declarations (identity, PLANS, MEMBERS) and pure helpers (install target, security headers, error logs)
  db/          the app's own Drizzle tables (none yet; the shared ones are the preset's)
  routes/      thin: app/ (embedded; `middleware = [firesio.adminMiddleware]`, one-line files mounting @firesio/app/ui/*), public/, auth/, webhooks/, healthz
  components/  presentational React; i18n/ the language of a request and the label objects the library pages take
workers/       app.ts: fetch, then `firesio.queue`, `firesio.scheduled`, `firesio.email` and `AdminApi = firesio.AdminApi`
drizzle/       the app's migrations (one baseline; the libraries' tables included)
tools/         architecture tests; eslint.boundaries.js is the layer table
```

The layers and the bans (no `as`, no `any`, no `Date.now` or `randomUUID` outside tests (the preset's runtime reads them), files at most 400 lines, functions at
most 40) are enforced by `npm run lint`; `npm run verify` runs typecheck, lint and every test. CI (`.github/workflows/verify.yml`)
runs it plus a production build only on a pull request that touches code, on a release tag `v*`, or by hand (to save
Actions minutes); a push to `main` runs no CI, so run `npm run verify` before you push.

## What an app writes

Plans (`app/core/plans.ts`), roles and permissions (`members.ts`), the identity (`identity.ts`), the names of the plans page's
entitlement keys and any other words of the library pages (`app/i18n/labels.ts`), its own pages and tables (`app/db/schema.ts`), and
the options of `createFiresio` in `app/firesio.server.ts` that differ from the defaults: `content` and `notifications` (the
preset sends the support mails with its own English texts), `metrics` (your own keys next to the standard ones), `meters`, `ai`,
`support` (`false` leaves support out), `purge` and `customerData` for tables and customer data of its own. Everything else is the
preset's: see `node_modules/@firesio/app/src/preset/README.md` (every option, its default and the bindings it reads).

## Two Shopify apps: dev and prod

`shopify app dev` rewrites `application_url` and `redirect_urls` to the current
tunnel URL every run. Pointed at your production app, that repoints live
merchants at a tunnel on your laptop. So there are two configs, each linked to
its own app in the Dev Dashboard — every project started from this template
creates its own pair, since `client_id` ships empty:

| File                   | App        | `automatically_update_urls_on_dev` | Used by                       |
| ---------------------- | ---------- | ---------------------------------- | ----------------------------- |
| `shopify.app.dev.toml` | "My App (Dev)" | `true` — tracks the tunnel      | `npm run dev`, `deploy:dev`   |
| `shopify.app.toml`     | "My App"   | `false` — URL is fixed             | `npm run deploy:prod`         |

Keep `[access_scopes]` and the webhook list in sync between them: a scope that
exists in only one env produces bugs that reproduce in only one env.

## The Shopify CLI

`scripts/shopify.mjs` wraps every CLI call, and all the `npm run` Shopify
scripts go through it. It runs this repo's `@shopify/cli` devDependency (the
version is pinned in `package.json`) instead of whatever `shopify` is on your
`PATH`.

The login session is the **normal one**: the CLI uses your real `HOME`, so the
account you are already logged into on this machine (`shopify auth login`) is
the one this project uses, like any other Shopify app. There is no per-project
login and no `.shopify-home/` any more; a leftover one from an older checkout is
ignored and can be deleted.

In dev the Workers AI binding is **off** by default (the spam check then answers "no opinion"), because it has no local
simulation and turning it on opens a session on Cloudflare at every start. Use `DEV_REMOTE_BINDINGS=1 npm run dev` when
you are working on an AI feature; it needs `wrangler login` and bills real usage.

`npm run dev` hides wrangler's own warnings (`WRANGLER_LOG=error`, set by `scripts/shopify.mjs` for `app dev` only), chiefly
"Missing required secrets": the Shopify CLI injects `SHOPIFY_API_SECRET` itself and the other names are optional locally;
`secrets.required` still guards the production deploy. Run `WRANGLER_LOG=warn npm run dev` to see them again.

Output that comes from tools and cannot be turned off from the app: the Shopify CLI's extension build lines, `app-logs | Error
while polling app logs. Retrying in 5 seconds.` (the CLI starts log polling only when the app has a Function extension and
repeats that line while Shopify's `app_logs/poll` endpoint answers 401, 429 or 5xx; there is no flag for it), Vite's
"`envFile` option is deprecated" (from `@react-router/dev`), and `config.future.expiringOfflineAccessTokens true` (a stray
`console.log` in `@shopify/shopify-app-react-router` 3.0.2's token exchange).

`npm run dev` checks the theme app extension server's default port (`9293`) and
GraphiQL's default port (`3457`) before starting Shopify CLI. If another process
owns either port, the wrapper passes the next available port via the matching
CLI flag; Shopify CLI prints the selected URLs.

## Deploying

```bash
npm run cf:deploy
```

That is `verify` -> production build -> D1 migrations -> `wrangler deploy`, in one step on purpose. **Never build and deploy
separately**, and never run a bare `wrangler deploy`: `@cloudflare/vite-plugin` bakes the resolved environment into
`build/server/wrangler.json` at **build** time, and `wrangler deploy --env production` on a dev build silently ships localhost vars with
placeholder ids. `CLOUDFLARE_ENV=production` at build time selects `env.production`.

Wrangler environments do **not** inherit bindings, vars, triggers or routes: `env.production` re-declares every one, and
`scripts/wrangler-bindings.test.mjs` fails when the two lists differ. `cf:deploy` refuses to run while a production binding still says
`REPLACE_ME` or a launch value is a placeholder (`npm run check:placeholders`).

Required secrets (`secrets.required` in `wrangler.jsonc`; set with `wrangler secret put <NAME> --env production`): `SHOPIFY_API_SECRET`,
`ATTACHMENT_TOKEN_SECRET`, `EVENT_HASH_SECRET` (the key every app and the portal hash events with; `EVENT_HASH_KEY_ID`, a var, is the public
half) and `PARTNER_API_TOKEN`. The preset treats `PARTNER_API_TOKEN` as optional; this template requires it by choice, because the plan
a shop is on is read from Shopify's Managed Pricing through the Partner API (`PARTNER_ORG_ID` and `PARTNER_APP_ID` are vars). Optional,
not declared: `TURNSTILE_SECRET_KEY` (the support form's bot check), `SHOP_CUSTOM_DOMAIN` (only an app that serves a shop's custom
domain), `SHOPIFY_API_SECRET_PREVIOUS` (only while rotating the Shopify secret). `SHOPIFY_API_KEY` is a public client id.

Workers Builds installs the private `@firesio` packages only if the build has `NPM_TOKEN` (section 3 of the platform design says this is
**not yet verified**); the fallback is to deploy from GitHub Actions.

**Migrations retry on a transient Cloudflare 5xx** (`scripts/migrate.mjs`): applying them is idempotent, which makes the retry correct.

## Scripts

`npm run verify`, `new-app`, `dev`, `build`, `db:generate`, `db:migrate:local`, `db:migrate`, `cf:deploy`, `check:placeholders`,
`cf-typegen` (after every `wrangler.jsonc` change; `worker-configuration.d.ts` is committed on purpose), `setup:skills`,
`docs:polaris:sync`, the Shopify wrappers (`config:link:*`, `deploy:*`, `generate`, `env`, `graphql-codegen`).

## Dependency overrides: do not remove

The `overrides` in `package.json` pin transitive packages (`undici`, `esbuild` under `@esbuild-kit`, `lodash` under the Shopify codegen)
to patched versions. Remove one only after checking `npm audit` without it.

## Conventions for agents

`CLAUDE.md` is the contract; `.claude/rules/` loads per area; `agent-skills/` has the recipes; `docs/` is reference. Changing the
template: edit `CHANGELOG.md` and `template-files.json` (a tracked file must be classified as the template's or the app's), and say in the
entry what a derived app does besides the merge.
