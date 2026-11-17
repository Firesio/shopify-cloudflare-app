# App Adoption Checklist

> Start with [SETUP.md](SETUP.md). This document is the detailed release and
> compliance checklist for teams that need the full audit trail.

## If you are an agent working in a DERIVED app

`CLAUDE.md` in the template says placeholders stay and nobody asks for real values. **That is reversed the moment the repository is an app**: the work is to make it real. You are in a derived app when the owner says so or `npm run new-app` has been run. Do this as part of the adoption, not later:

1. **Replace every placeholder** (run `npm run check:placeholders`; it must pass before a production deploy). Surfaces: `app/core/identity.ts` (name, brand, contacts, legal address and effective date), `app/routes/public/**` (landing, support, privacy, terms), `app/core/plans.ts` (plan names, prices, limits), `app/routes/app/home.tsx` (the placeholder home page), `wrangler.jsonc` (real resource ids, `SHOPIFY_APP_URL`, app handle, `SCOPES`, `PARTNER_ORG_ID`, `PARTNER_APP_ID`, `EVENT_HASH_KEY_ID`), `shopify.app*.toml` (client id, URLs, scopes, webhooks), and the support copy (only state a response time the business really commits to).
2. **Unknown real value (legal address, app name, price, SLA): ask the owner.** Never invent one, never weaken `check:placeholders`.
3. **Fix the docs and the agent instructions in the same change.** The derived app is not a template any more:
   - In `CLAUDE.md`, replace "What this repo is" with a short "This app" section (what it does, who it is for, what is deliberately out of scope) and delete the "placeholders are intentional" rule; `check:placeholders` is now an ordinary release gate.
   - Rewrite `docs/README.md` for the app: drop template-only documents that no longer apply (`SETUP.md`, this checklist once complete); keep `UPGRADING.md` and `template-files.json` if the app still pulls template updates.
   - Record the app's own verified Shopify findings in `docs/shopify-api-invariants.md` and its own decisions in the rule that owns the area.
   - Get the app declared in the portal (section 5): one pull request to the Firesio platform repo. Until it is merged and deployed, the portal lists the app as pending and stores none of its events.
4. Run `npm run verify` after each area and say what was changed and what was verified.

## Refactor plan (short version)

1. **Identity:** edit `app/core/identity.ts` once; keep public pages, legal pages
   and email branding derived from it.
2. **Shopify:** keep client IDs, app handles, plan handles and shop
   domains separate; validate each against the API/configuration that owns it.
3. **Database:** the app's own tables are in `app/db/schema.ts` (passed to `createFiresio({ schema })`, so `shop/redact` erases every one that has a `shop` column), the shared ones are `@firesio/app`'s (`drizzle.config.ts` lists their schemas); queries are bound and preserve shop isolation (`.claude/rules/data.md`).
4. **Tests:** assert rendered output and persisted state, especially billing,
   quotas, retries, tenant isolation, and launch placeholder checks.

Finish these four areas in that order, running `npm run verify` after each area.
Live Shopify billing and production deployment remain manual release checks.

Use this checklist after creating a new repository from the template and before
deploying an app. It deliberately names decisions that no template can make
truthfully for another business. Complete each gate with an accountable owner
and evidence; a checked box is not a substitute for a tested implementation.

## 1. Establish app identity and Shopify configuration

- Set the canonical product, company, support/privacy contacts, legal address and
  effective date in `app/core/identity.ts`; do not reintroduce identity literals in routes, legal pages or mail texts
  (the preset's mail texts take the app's name as a variable: `identity.name` in `app/firesio.server.ts`; to word them differently pass `content` and `notifications` there).
- Create separate Shopify applications for development and production. Link
  `shopify.app.dev.toml` only to the development application and
  `shopify.app.toml` only to production (`npm run config:link:dev`, then `npm run config:link:prod`;
  both fill in `client_id`, which the template ships empty). Review the TOML diff each time.
- Set the production application URL and redirect URL, then confirm the
  production `SHOPIFY_APP_URL` and `SHOPIFY_API_KEY` (the client id, public configuration) agree with the production
  Shopify configuration. `npm run check:placeholders` refuses a drift. It also requires `env.production.routes` to be the one custom domain
  that is the host of `SHOPIFY_APP_URL` (with `workers_dev` and `preview_urls` off), the webhook queues to be named `<slug>-webhooks` /
  `<slug>-webhooks-prod`, and both tomls to subscribe the same webhook topics at the same `/webhooks/...` URIs (`shopify app config link` has dropped them).
- Choose only the Admin API scopes the app needs. The template starts with none.
  Scopes are ONE decision written in four places: `scopes` in both TOML files and the
  `SCOPES` var of the top level and of `env.production` in `wrangler.jsonc`;
  `check:placeholders` refuses a pair that differs. Request protected
  customer-data access before adding topics that need it.
- The Admin API / webhook version is one decision too: `app/core/api-version.ts` and
  `api_version` in both TOML files (the check reads the first and compares).
- Keep the Shopify API secret out of source control: it is the `SHOPIFY_API_SECRET` Cloudflare secret.
- Configure Partner access, which this template **requires** (the preset treats it as optional):
  a Partner API client that may read the app's subscriptions, whose token is the
  `PARTNER_API_TOKEN` secret; `PARTNER_ORG_ID` (the numeric organization id in
  `partners.shopify.com/<id>`) and `PARTNER_APP_ID` (the app's id in the Partner Dashboard, the
  numeric id or its GID) are vars in `wrangler.jsonc`, in both environments. The plan a shop is
  on is read from Shopify's Managed Pricing through that API; without the token the
  refresh reports `not_configured` and every shop stays on the free plan. Verify with a real
  shop and a test subscription: a `null` subscription means no active contract, not that an
  app mismatch is safe to ignore.

## 2. Replace product, legal, and translated copy

- Replace brand, feature, support, pricing, plan, identity, contact, and URL
  copy in every language the app ships. Do not publish an untranslated fallback or text that
  describes a different product.
- Complete the privacy policy and terms with qualified legal review (`LEGAL_TEMPLATE.md`). Inventory
  every processor, data category, purpose, retention period, transfer, and
  contact route that the actual app uses.
- Ensure the public privacy, terms, pricing, and support pages are reachable at
  their final URLs and manually verify them in production.
- Run `npm run check:placeholders`; it is expected to block a fresh template and
  must pass before a production deploy.

## 3. Decide billing, AI and members

- Replace the catalogue in `app/core/plans.ts` (`definePlans({ features, plans })`) with actual features, plan names,
  prices, intervals and Managed Pricing handles (the plan handle is the key that joins Shopify's subscription
  to the table; exactly one plan is free). Verify the same handles in Shopify's Partner configuration before billing a merchant.
  The plans page is generated from the catalogue: a feature's `name` is its row, every `capacity` and `quota` is a usage meter,
  `show: false` keeps a gate off the page. Declare a feature only when something backs it: `members.max` is enforced by the
  members library, `tickets.max` is only shown (a capacity whose `count` is the preset's open-ticket count, passed in by
  `app/firesio.server.ts`) and a hard limit is the app's own check; a `quota` such as emails per day needs the app's own
  `services.usage.consume(shop, "<the feature's key>", ...)` call (the template ships none: the preset counts no mail
  against a daily allowance, so a `mail.daily_max` quota would show 0 forever); a `metered` feature (usage billed by Shopify)
  needs its meter in the Partner Dashboard, `services.billedUsage.record(...)` and `firesioSchemaPaths({ metered: true })`.
- AI works out of the box: the support form's spam check asks Cloudflare's decision model (Clef) and answers "no opinion" when
  it is unavailable, so a real customer's mail is never lost to a model; a feature of your own calls the shop's `ai`
  (`CLAUDE.md`, section "AI"). Cloudflare's Auto Router picks the model; pin one per feature in `ai.models` only when a
  feature needs it. Before merchants see AI, pass `ai: { gate }` to `createFiresio` with an explicit entitlement, quota,
  abuse, cost and emergency-disable policy (and an AI Gateway spend limit on the `app` metadata as a safety net), and test
  the normal, over-limit, provider-failure and refused states.
- Decide who may use the app, in `app/core/members.ts` (`defineMembers`): how a Shopify user who is not yet a member is
  handled (`onUnknownUser`: `auto_join`, `invite_only`, `approval`), the role strangers get, whether to
  ask Shopify for the person's email and name (`onlineTokens`; `invite_only` needs it), and the
  permissions each role holds. Guard every embedded route with `firesio.requirePermission`. Members are
  staff of the merchant, so they carry a name and an email: confirm the privacy copy covers them.
  The team page is the library's, mounted at `/app/members`. Decide whether merchants may give a person
  permissions of their own (`customPermissions`), and what happens to a team over its seat limit after a downgrade
  (`seatOverage`: `never_remove`, or `notify_then_trim` with `noticeHours`: it tells the shop's owners and
  admins and then takes the extra people off their seats, never an owner and never the last team manager;
  check the two notice emails read well in every language you ship). Reference:
  `node_modules/@firesio/app/src/members/README.md`.

## 4. Inventory customer data and compliance behavior

- List every table, object, cache, log, queue payload, email, analytics event,
  and third-party processor that can contain merchant or customer data.
- For each new category of customer data, update the compliance handlers
  (`customerData: { stores: true, dataRequest, redact }` in `app/firesio.server.ts` when the app stores customer data;
  the default is `{ stores: false }`), the deletion/retention policy, access process, and privacy copy.
  `shop/redact` erases every table with a `shop` column on its own; a table keyed by another column goes in
  `purge.shopScoped`, one that must survive in `purge.keep`. Test the real data path; webhook routing alone is not proof that data is deleted.
- Confirm Shopify mandatory compliance webhooks, HMAC verification, and
  idempotency behavior after adding or changing any data-bearing feature.
- Assign an owner for security incidents and data-subject requests, including a
  monitored contact channel and response expectations.

## 5. Provision production resources, secrets and the portal

- Create the production resources `npm run new-app` listed: the D1 database, the `SESSION` KV namespace, the R2
  bucket for support attachments, the webhook queue and its dead-letter queue (this Worker consumes both: they must exist before the first deploy); bind the portal's blocklist KV
  namespace (read only) as `PORTAL_BLOCKLIST`; give the three rate-limit bindings namespace ids that no other app on
  the account uses; set their production ids in `wrangler.jsonc` under `env.production`; then run
  `npm run cf-typegen`. The `portal-events` queue is the portal's and already exists: this app only produces to it.
- Declare and provision every required secret: `SHOPIFY_API_SECRET`, `ATTACHMENT_TOKEN_SECRET`,
  `EVENT_HASH_SECRET` (the shared key; `EVENT_HASH_KEY_ID` is the var that names it) and `PARTNER_API_TOKEN`.
  `TURNSTILE_SECRET_KEY` (with `TURNSTILE_SITE_KEY`), `SHOP_CUSTOM_DOMAIN`, `SHOPIFY_API_SECRET_PREVIOUS` and `SETTINGS_SECRET_KEY` (only for an app that uses `settings`) are optional and not declared. Secrets are never app configuration values.
- Support mail: onboard the sending domain to Email Sending and set `EMAIL_FROM` and `EMAIL_FROM_NAME`
  (vars, in both environments) only after authorizing it; route `support@<your domain>` through Email Routing to
  this Worker (without `EMAIL_FROM` nothing is sent).
- Confirm the production crons (`30 3 * * *` daily, `* * * * *` outbox drain), the webhook
  queue/DLQ names and the rate-limit bindings are present (`check:placeholders` and
  `scripts/wrangler-bindings.test.mjs` read them).
- **Declare the app in the portal: ONE pull request to the Firesio platform repo; the review is the approval (there is no Register button). This is the one copy of the steps: the README, SETUP, CLAUDE.md and `npm run new-app` point here.**
  1. `apps/portal/app/core/apps/declared-apps.ts`: an entry with the app's `slug` (the `appSlug` its events carry,
     `app/core/identity.ts`), `name`, `kind`, the `binding` key (a service binding of the portal's `Env`; `wrangler types`
     gives it to the type and `apps/portal/app/shell/apps/app-bindings.ts` says how to reach it), optionally default `modules`,
     `links` and `staffPages`, and `campaigns: true` if the app has adopted the `campaigns()` command group
     (without it the portal does not ask the app about campaigns). The template does not implement that group.
  2. Commands: in the same PR, declare the service binding in `apps/portal/wrangler.jsonc`, at the top level AND under
     `env.production` (bindings are not inherited), with `entrypoint: "AdminApi"` and `service` the app's production Worker name,
     `<slug>-production`:
     `{ "binding": "<KEY>", "service": "<slug>-production", "entrypoint": "AdminApi" }`.
     That name is this repo's: the top-level `name` of `wrangler.jsonc` (which `npm run new-app` sets to the slug) plus the
     environment, `-production`. `shell/apps/declared-apps-wrangler.test.ts` in the platform repo fails when the two files
     disagree. `export const AdminApi = firesio.AdminApi` in `workers/app.ts` is the app's half.
  3. App side: the producer binding to `portal-events` (and `portal-events-prod` under `env.production`) is already in `wrangler.jsonc`.
  4. After the portal deploys, its `*/5` cron reconciles the declaration into the `apps` table (it inserts what is missing with the declared
     default modules and never deletes or disables), so the app's events are accepted within five minutes. The portal's `/apps` page keeps
     the runtime state (events accepted or refused, module switches) and a "Test connection" button (a read-only `billing().plans({})` over the
     binding): press it after the first deploy. Events from a slug nobody declares are not stored.
  5. Staff pages of the app's own (`/internal`) need no portal change: bind the portal's `STAFF_DIRECTORY` KV read-only, put the path
     behind its own Cloudflare Access application, verify the Access JWT, then `createStaffDirectoryReader` from `@firesio/portal-client`.
     Optionally list the pages in the declaration's `staffPages` so `/apps` links to them.

## 6. Establish operations and release controls

- Assign owners and alert routes for Worker errors, cron step failures (`cron.step_failed`), a growing or dead
  `portal_outbox`, webhook DLQ depth, D1 recovery, secret rotation, and production access.
- Test a rollback and D1 recovery procedure in a non-production environment.
  A Worker rollback never reverses a data migration.
- Choose CI/CD identity, protected environments, review approvals, audit logs,
  artifact retention, and dependency-update policy. `.github/workflows/verify.yml` runs `npm run verify` and a production
  build on pull requests that touch code, on `template-v*` tags (change `tags:` in `verify.yml` to your own release tag pattern) and by hand; Workers Builds (if you connect it) deploys `main` without it.
  Automation is organization-specific; do not copy an unreviewed workflow from another app.
- Follow the incident and release procedures in [the operations runbook](OPERATIONS.md).

## 7. Perform the current App Store review

- Run the current Shopify App Store self-review against the completed app, not
  the template. Recheck Shopify requirements at submission time because they
  change.
- Verify installation and authentication (token exchange: there is no OAuth callback, the install is recorded in `afterAuth`), billing, uninstall,
  mandatory webhooks, support, privacy, and terms end to end on a production-like environment.
- Uninstall, then reinstall within seconds (Shopify's reviewers do exactly
  this): the app opens and authenticates, and the late `app/uninstalled`
  webhook does not mark the new install uninstalled (the preset applies an uninstall only when no newer lifecycle fact is stored).
  Not verifiable without a real store.
- Review listing copy, screenshots, support contact, permissions, data use,
  merchant-facing error states, and accessibility with the final product.

## Release evidence

Attach the following to each production release: the commit SHA, reviewer and
approver, `npm run verify` output, production build output, placeholder-check
output, migration record, deployment version ID, and post-deploy smoke-test
results. This is the minimum evidence for a reproducible release, not a
replacement for your organization's change-management requirements.
