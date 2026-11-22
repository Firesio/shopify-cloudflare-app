# Operations runbook

This guide is for the operator of an app made from this template, after its production resources and credentials have been
provisioned (`npm run new-app` lists them). It does not provide a deploy workflow for a particular CI provider: choose an
organization-specific identity, approval, audit-log and rollback policy before automating any of these steps.

What runs in production is the template's Worker (`workers/app.ts`) with the `@firesio/app` preset behind it: the webhook, jobs, notify and
mail-events queue consumers, the cron (which only triggers), the Workflows class `FiresioFlows`, the Durable Object `ShopCoordinator`, the support mail handler,
`/healthz` and the `AdminApi` the portal calls. What the preset does at each step is documented in
`node_modules/@firesio/app/src/preset/README.md`.

Commands use the repository-pinned Wrangler (`npx wrangler`, the `wrangler` devDependency of `package.json`). Commands marked
**operator-run** need the right Cloudflare account and can change remote state; review the target names and the current release
before running them. The resource names in the commands are the app's own: `npm run new-app` renames the template's (`app-db-prod`,
`my-app-webhooks-prod`, `app-support-uploads-prod`) in this file as it does in `wrangler.jsonc`.

## Deploy a release

1. Review the `production` environment of `wrangler.jsonc`, `shopify.app.toml` and the production resource names. Named
   environments do not inherit bindings.
2. Set every required secret with an interactive prompt. Never put a value in a command argument, shell history, a repository
   file or a build log.
3. Run the release gate and deploy from the same commit. `npm run cf:deploy` runs `check:placeholders`, verification, the
   production build, the D1 migrations and then deploys the built Worker; do not replace it with a bare `wrangler deploy`.

```bash
# operator-run: each prompts for the secret value
npx wrangler secret put SHOPIFY_API_SECRET --env production
npx wrangler secret put ATTACHMENT_TOKEN_SECRET --env production
npx wrangler secret put EVENT_HASH_SECRET --env production
npx wrangler secret put PARTNER_API_TOKEN --env production
npx wrangler secret put NOTIFY_SECRET --env production      # 32+ characters: openssl rand -base64 32
npx wrangler secret list --env production

# operator-run: validates the populated production release contract
npm run check:placeholders

# operator-run: applies D1 migrations before the Worker deploys
npm run cf:deploy
```

Secrets (set with `wrangler secret put`, declared by NAME in `secrets.required` of `wrangler.jsonc` in both environments):

| Secret | What it is |
|---|---|
| `SHOPIFY_API_SECRET` | The app's client secret: verifies webhooks and the session tokens of the embedded app. |
| `ATTACHMENT_TOKEN_SECRET` | Signs the links of support attachments. |
| `EVENT_HASH_SECRET` | The HMAC key every app and the portal hash events with (32+ characters). Its public half, `EVENT_HASH_KEY_ID`, is a var. |
| `NOTIFY_SECRET` | Keys the address hashes of the notify kernel and signs every unsubscribe link (32+ characters; the preset refuses to build without it). **Never change it after the first mail**: a new value makes every unsubscribe link already sent invalid and every stored address hash unmatched. |
| `PARTNER_API_TOKEN` | A Partner API token that reads this app's subscription (Managed Pricing). The preset treats it as optional (without it the subscription refresh reports `not_configured` and every shop stays on the free plan); **this template requires it**, because the plan a shop is on is the product. |

Optional and NOT declared (a name in `secrets.required` is a deploy-time requirement): `TURNSTILE_SECRET_KEY` (the support form's
bot check; `TURNSTILE_SITE_KEY` is the public var), `SHOP_CUSTOM_DOMAIN` (only an app that serves a shop's custom domain),
`SHOPIFY_API_SECRET_PREVIOUS` (only during a rotation, below), `SETTINGS_SECRET_KEY` (seals the `secret()` fields of the `settings` library at rest, AES-256-GCM; base64 of 32 random bytes; without it a Worker whose settings groups hold a `secret()` field refuses to build its services, `SettingsSecretKeyMissing`, unless `SETTINGS_SECRETS_PLAINTEXT` is `"allow"` at the top level, development only; `SETTINGS_SECRET_KEY_ID` and `SETTINGS_SECRET_KEY_PREVIOUS` with its `_ID` serve a rotation). The template's sample settings group holds no secret, so it has no use for the key until an app adds one.

Everything else is a var in `wrangler.jsonc`, committed on purpose: `SHOPIFY_API_KEY` (the public client id), `SCOPES`,
`SHOPIFY_APP_URL`, `SHOPIFY_APP_HANDLE`, `MAIL_DOMAIN`,
`TURNSTILE_SITE_KEY`, `AI_GATEWAY_ID`, `EVENT_HASH_KEY_ID`, `PARTNER_ORG_ID`, `PARTNER_APP_ID`. Their names must be in
`wrangler.jsonc` so `Env` can be generated on a clean checkout (`npm run cf-typegen`); the values of secrets live only in the
secret store and, locally, in `.dev.vars`.

## Automatic deploys from `main` (Workers Builds)

When the Worker is connected to its GitHub repository in Cloudflare Workers Builds, **every push to the configured branch builds
and deploys production**. The settings (Workers & Pages > the Worker > Settings > Builds) are:

| Setting        | Value                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Branch         | `main`                                                                                         |
| Build command  | `npm run verify && npm run build`                                                              |
| Deploy command | `npx wrangler deploy`                                                                          |
| Build variable | `CLOUDFLARE_ENV=production` (selects `env.production`; without it the build bakes local config) |

**Why the build command runs `npm run verify`.** A push to `main` is a release and used to deploy without running any test: `npm run build` alone only compiles. Builds run the build
command before the deploy command, so a verify that fails fails the build and (to be confirmed, see below) nothing deploys. `verify` is `wrangler types --check`, the type check, lint and the whole
suite (workerd and jsdom included; outbound network is blocked in the tests, so it needs nothing but the install). A build may take 20 minutes and a paid account has 6,000 build minutes
a month: the suite runs in about a minute and a half. **Not yet verified:** that a failing build command stops the deploy command. Verify it ONCE, on a throwaway Worker connected to a
throwaway branch, with a deliberately failing test, before relying on it; until then `npm run verify` before every push is still the rule (`CLAUDE.md`).

`npm run build` runs `scripts/ci-release.mjs` after the Vite build. It acts only inside Workers Builds (`WORKERS_CI`): it first runs
`npm run check:placeholders` (fatal: a placeholder, a route, queue or webhook that drifted stops the build before anything is applied), then applies
the D1 migrations to the production database `wrangler.jsonc` names under `env.production` (fatal on failure, so code never lands ahead of its schema) and then, best effort, deploys the Shopify app
config with the repository's pinned Shopify CLI, only when the commits touched `shopify.app.toml` or `extensions/`. Two optional
build variables: `D1_MIGRATIONS_API_TOKEN` (a token that may edit D1, used for the migration step when the build's own token may not)
and `SHOPIFY_APP_AUTOMATION_TOKEN` (without it the Shopify deploy is skipped; the build never logs anything about its value).
`@react-router/dev` is a devDependency: the build runs after `npm ci`/`npm clean-install`, which installs devDependencies (the Vite, Cloudflare and Wrangler tooling the build needs are devDependencies too), so it needs no special setting. Run `npm run verify` yourself before pushing to `main` all the same (a red build costs minutes; a green push is a release); CI (`.github/workflows/verify.yml`) runs it only on a pull request that touches code,
on a `template-v*` tag (a derived app picks its own pattern in `verify.yml`) or by hand. Runtime secrets are not build variables; they stay on the Worker. Installing the private `@firesio`
packages in the build needs `NPM_TOKEN` as a build variable (a read-only `read:packages` token); that this works in Workers Builds is not
yet verified, so check the first build.

## Incident: roll back first, then data

Two different recoveries, in this order. A Worker rollback does not roll back a D1 schema or data change, so first decide whether the incident is code-only or needs a data recovery
plan, and start with the cheap, reversible one.

1. **Stop the harm, then look.** Cloudflare alerts reach the portal (Issues, Monitors, the system health check: below). Read the log lines of the failing release by `event` and `version`
   (every line carries the deploy's `CF_VERSION_METADATA` tag): `npx wrangler tail --env production --format json --status error`.
2. **Roll the Worker back** to the last known-good version. This is the first move for a bad deploy: it takes seconds and changes no data.
3. **Data only if data is wrong.** A bad release that wrote bad rows needs D1 Time Travel (next section) after the rollback, never before: restoring under a Worker that still writes bad rows
   restores nothing.

```bash
# operator-run: inspect available releases, then choose a known-good version ID
npx wrangler deployments list --env production
npx wrangler rollback <known-good-version-id> --env production \
  --message "Rollback: <incident reference>"

# operator-run: observe the recovered release; filter to known failure events
npx wrangler tail --env production --format json --status error
```

What a rollback cannot do: it reaches the last 100 versions; it is refused when the target version binds a KV namespace, R2 bucket or queue that has since been deleted, and when the move would
change a Durable Object class's lifecycle (`migrations`). It does not change a resource a binding points at, and it does not touch D1.

**That is why migrations are expand-only** (`.claude/rules/data.md`, `tools/architecture/migration-guard.test.ts`): a release applies its migrations BEFORE the new code is live, so the previous
version's code runs on the new schema, and after a rollback the old code runs on it for good. A removal (`DROP`, `RENAME`) is its own `*_contract.sql` file, released one version AFTER the code stopped
reading the thing. If the failed release includes a migration, the rolled-back Worker is compatible with it by construction; if you broke that rule, ship a forward corrective migration. Do not apply
an old migration file in reverse without an approved, tested recovery plan.

**Slow queries and size.** `npx wrangler d1 insights app-db-prod` (experimental; 31 days kept) lists the queries that read or took the most; run it after a release that touched a page's
queries and routinely once a month. A D1 database is capped at 10 GB: watch its size (`npx wrangler d1 info app-db-prod`) and put it in a Monitor.

## D1 backup and recovery

Before a data-affecting operation, take an export and record its checksum and the release SHA in the incident or change record.

```bash
# operator-run: creates a SQL export of the remote production database
npx wrangler d1 export app-db-prod --remote --output /tmp/app-db-prod.sql

# operator-run: inspect a point available for Cloudflare D1 Time Travel
npx wrangler d1 time-travel info app-db-prod

# operator-run, destructive: restore the named remote database to an approved timestamp
npx wrangler d1 time-travel restore app-db-prod --timestamp <RFC3339-timestamp>
```

Test an export in an isolated database before relying on it. `wrangler d1 execute <database> --remote --file <sql-file>` can ingest
SQL, but restoring an export into production is a data migration and needs a reviewed plan, a maintenance window and explicit owner
approval. Time Travel is the preferred whole-database recovery mechanism when its retention window covers the event.

A restore also rolls back `webhook_deliveries` and `portal_outbox`: a delivery Shopify already got a 2xx for is then missing its inbox row
(a retry from Shopify or a replay from the DLQ, below, brings it back), and an outbox row that was `sent` becomes `pending` again and is
sent a second time (the portal drops the duplicate by event id).

## Scheduled work (cron), jobs and R2

**A cron only triggers.** Production has three crons (`triggers.crons`, re-declared under `env.production`; `tools/architecture/wrangler-crons.test.ts` holds `wrangler.jsonc` to the strings the preset
knows). Each tick drains the portal outbox into the `portal-events-prod` queue (up to 50 events a run) and puts the periodic JOBS of its trigger on the jobs queue, one message per job, keyed by the
time slot (a cron that fires twice is one job). The work is the jobs':

- `* * * * *`, every minute: `usage_reports` (Shopify usage billing, when the plan declares a metered feature), `messaging` (texting, when declared) and the app's `cron.everyTick` steps.
- `0 * * * *`, hourly: `uninstall_probe`, `metrics_backfill`, `held_usage_sweep` (a quota reserved with `services.usage.reserve` and never settled is given back after `heldUsageMaxAge`), `flows_reconcile`
  (creates the flow instances that should be running and are not), `subscriptions_sync`, `token_refresh_sweep`, `mail_sweep` (re-queues a delivery whose queue message was lost) and `cron.hourly`.
- `30 3 * * *`, daily: `metrics_snapshot` (yesterday's counts, one `metrics.snapshot` event), `prune` (sent outbox rows, usage counters, expired uploads, job claims and dead letters, the mail log and the
  address of a finished delivery after `retention.mailAddressDays`, command runs, and the preset's logs by `retention`), `shop_sync_sweep`, `subscriptions_sweep_start`, `grants_expiry`, `devices_purge_stale`
  and `cron.daily`.

Development has one cron, `*/5 * * * *`, which triggers all of it.

A job that did something logs one line with its kind and counts; a job that threw is retried with its own backoff, and one that gave up is copied into D1 (`firesio_dead_letters`), told to
the portal (`app.alert`, code `jobs.failed`, the kind only) and heard by `on.jobFailed`. A job that failed does not stop the others and is repaired by the next tick. A step of the preset's an app runs at its
own pace is left out with `cron: { preset: { <step>: false } }` and enqueued by `firesio.jobs().enqueueStep(...)`; while the app's `frozen` option answers true, a tick drains the outbox and does nothing
else and the queues are held (nothing is lost).

```bash
# operator-run: stream structured failures from the deployed Worker
npx wrangler tail --env production --format json --search job.dead_letter

# operator-run: the jobs the system gave up on (the portal lists and resends the same rows)
npx wrangler d1 execute app-db-prod --remote --command \
  "SELECT id, queue, kind, shop, attempts, created_at FROM firesio_dead_letters ORDER BY created_at DESC LIMIT 50;"

# operator-run: inspect expired pending-upload rows before remediation
npx wrangler d1 execute app-db-prod --remote --command \
  "SELECT id, r2_key, expires_at FROM pending_uploads WHERE expires_at <= CAST(strftime('%s','now') AS INTEGER) * 1000;"

# operator-run: verify one expected object exists without exposing it publicly
npx wrangler r2 object get app-support-uploads-prod/<object-key> --remote \
  --file /tmp/upload-verification.bin
```

Do not run a broad R2 deletion to "clean up" failed uploads. Use the row and object key from the investigation, preserve incident evidence and let the scheduled sweep retry whenever possible.

**R2 folders and their lifecycle rules.** The package writes under fixed prefixes (`R2_PREFIX` of `@firesio/app/core`): `tmp/` (1 day), `exports/` (8 days: a GDPR export; the flow deletes at 7),
`documents/` (30 days), `backups/` (30 days), `images/` (never expired: derivatives live with their original). Create the rules ONCE per bucket (`-y` skips the prompt):

```bash
# operator-run, changes the bucket: the five rules
npx wrangler r2 bucket lifecycle add app-support-uploads-prod expire-tmp tmp/ --expire-days 1 -y
npx wrangler r2 bucket lifecycle add app-support-uploads-prod expire-exports exports/ --expire-days 8 -y
npx wrangler r2 bucket lifecycle add app-support-uploads-prod expire-documents documents/ --expire-days 30 -y
npx wrangler r2 bucket lifecycle add app-support-uploads-prod expire-backups backups/ --expire-days 30 -y
npx wrangler r2 bucket lifecycle add app-support-uploads-prod abort-multipart "" --abort-multipart-days 1 -y

# operator-run: what R2 stored
npx wrangler r2 bucket lifecycle list app-support-uploads-prod
```

Objects go within about 24 hours of expiry. **Never put a bucket lock on a folder that holds personal data**: a lock beats a lifecycle rule and blocks the deletes of `shop/redact`.

## Events that did not reach the portal (`portal_outbox`)

The app never fails a merchant's request because the portal is down: it writes the event into `portal_outbox` and the cron sends it. A row is
`pending` (to send, with `attempts`, `next_attempt_at` and `last_error`), `sent`, or `dead` (ten failed sends, or a payload that cannot be read; kept
for inspection, never pruned). A growing `pending` count or any `dead` row is the alert: the `outbox_drain` step logs `picked`, `sent`, `retried` and `dead`.

```bash
# operator-run: the outbox by status
npx wrangler d1 execute app-db-prod --remote --command \
  "SELECT status, COUNT(*) AS rows, MIN(created_at) AS oldest FROM portal_outbox GROUP BY status;"

# operator-run: what the dead rows say
npx wrangler d1 execute app-db-prod --remote --command \
  "SELECT event_id, type, attempts, last_error FROM portal_outbox WHERE status = 'dead' ORDER BY created_at LIMIT 50;"
```

Fix the cause first (the `PORTAL_EVENTS` binding and the queue name `portal-events-prod`, or the portal's consumer, which belongs to the portal's operators).
Then, with the owner's approval, put the rows you mean back in line; the portal's consumer dedupes on `(appSlug, eventId)`, so a second send is harmless:

```bash
# operator-run, changes state: one dead event back to pending (a row whose last_error says "unreadable payload" cannot be sent: leave it as evidence)
npx wrangler d1 execute app-db-prod --remote --command \
  "UPDATE portal_outbox SET status = 'pending', attempts = 0, next_attempt_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE status = 'dead' AND event_id = '<event-id>';"
```

## Secrets and credential rotation

Rotation is a deploy operation: replace the remote secret, deploy compatible code if needed, then validate the affected flow. Never log a
secret to prove that rotation succeeded; use the application flow and the secret-name listing (`wrangler secret list`) instead.

- **`SHOPIFY_API_SECRET`.** For up to an hour after a rotation Shopify may still sign webhooks with the old secret, so the preset accepts a second
  secret meanwhile. Put the CURRENT value in `SHOPIFY_API_SECRET_PREVIOUS` first, rotate in the Shopify Dev Dashboard, set the new value as
  `SHOPIFY_API_SECRET` at once, and delete `SHOPIFY_API_SECRET_PREVIOUS` an hour later (a revoked secret that stays accepted is a standing forgery
  risk). The previous secret covers webhooks only: the session tokens of the embedded app are checked against `SHOPIFY_API_SECRET` alone.
- **`ATTACHMENT_TOKEN_SECRET`.** Rotation invalidates every existing attachment link; say so before rotating.
- **`EVENT_HASH_SECRET`.** The portal and every app share it (with `EVENT_HASH_KEY_ID` naming the key). Rotating it is a platform decision made with
  the portal's operators, never from one app's repository alone.
- **`PARTNER_API_TOKEN`.** Revoking or rotating it also means updating the credential on the Partner side. Without a working token the subscription
  refresh reports `not_configured` and shops stay on the free plan.

```bash
# operator-run: interactive replacement; repeat for every affected secret
npx wrangler secret put SHOPIFY_API_SECRET_PREVIOUS --env production
npx wrangler secret put SHOPIFY_API_SECRET --env production
# an hour later:
npx wrangler secret delete SHOPIFY_API_SECRET_PREVIOUS --env production

# operator-run: verifies names only, never values
npx wrangler secret list --env production
```

## Dead letters: webhooks, jobs, mail

Every queue of the app has a dead-letter queue (`<slug>-<role>-dlq-prod`) that this Worker consumes, and `max_retries` says when a message goes there (8 for webhooks, notify and mail events; the
jobs queue's is 100 on purpose: the job system counts its own attempts). Create each queue with a 14 day retention
(`npx wrangler queues create <name> --message-retention-period-secs 1209600`; the default for a queue nobody consumes is 4 days).

- **Jobs, and the app's own queues.** The preset COPIES each dead letter into D1 (`firesio_dead_letters`, the body clipped to 64 KB, 30 days), tells the portal (`app.alert`, code `jobs.failed` or
  `queues.dead_letter`, the kind or queue only), logs it (`job.dead_letter`: queue, kind, attempts; never the body) and acknowledges it. The portal lists them on its System page and can
  RESEND one (the same dedupe key, the claim reset first; nothing is removed when the queue refuses). By hand: the SELECT above, and `firesio.deadLetters().resend(id)` from a script that runs in the Worker.
- **Webhooks.** The path of a delivery is in [Receiving Shopify webhooks](webhooks.md). The consumer retries a delivery whose handler threw (30 seconds doubling, at most an hour) until
  the queue gives up; the DLQ consumer marks the inbox row `dead_letter` (a `webhook.dead_letter` log line with the topic and a hash of the shop), tells the portal (`app.alert`, code
  `webhooks.dead_letter`, one per delivery) and acknowledges, so the message itself is gone: what stays is the row and the line. A message that never got past the inbox (D1 unavailable for all the attempts) has no row.
- **Mail.** A delivery that could not be sent is `failed` in `notify_deliveries` with its trace; the hourly `mail_sweep` re-queues a delivery whose queue message was lost. A message in
  `<slug>-notify-dlq` or `<slug>-mail-events-dlq` is acknowledged the same way.

```bash
# operator-run: DLQ backlog and consumer configuration
npx wrangler queues info my-app-webhooks-dlq-prod
npx wrangler queues consumer list my-app-webhooks-dlq-prod

# operator-run: the failed and dead-lettered webhook deliveries the inbox knows
npx wrangler d1 execute app-db-prod --remote --command \
  "SELECT id, topic, shop, status, attempts, failure_code, failure_detail FROM webhook_deliveries WHERE status IN ('failed', 'dead_letter') ORDER BY received_at DESC LIMIT 50;"
```

**Replaying a webhook.** Replay works through the inbox and is idempotent: a delivery already `processed` is acknowledged without running again, a `failed` or `dead_letter` one is taken over and run
again, and a delivery for a redacted shop is dropped. Fix the cause, deploy, then ask Shopify to resend (it does not replay one for you once its own retries, up to 8 over 4 hours, are spent;
compliance deliveries (`shop/redact` and the customer topics) have a 30-day window) or redrive from Cloudflare. The template does not keep the message bodies of the webhook DLQ: for the app's own topics
the inbox keeps a hash, not the payload, so a topic whose handler cannot refetch needs its own `deadLetterQueues` handler that keeps the body where a person can replay it
(`firesio.deadLetters()`). Never purge a DLQ as an incident response step: that discards the evidence and the work to recover. Record the delivery ids, the operator, the start and end time and the outcome.

## Content (the blog)

The app's own pages (`app/cms`): entries in D1 (`firesio_cms_*`, the app's, no shop column), uploaded images in the `UPLOADS` R2 bucket under `cms/<key>`
(the same bucket as support files; create it before the first deploy). The portal writes them through the `cms()` group of `AdminApi` once the app is declared
`cms: true` in its `declared-apps.ts`. Public pages are cached at the edge for a short while; a scheduled entry shows from its time and the daily sweep writes it.

## Mail

**Zero config:** the `EMAIL` binding sends with Cloudflare Email Sending from `notification@` and `support@` the app's domain (`app/notifications/streams.ts`; the host of `SHOPIFY_APP_URL`, or `MAIL_DOMAIN` locally); no provider account. Once per sending domain (operator-run, the domain's zone must be on this account):

```bash
npx wrangler email sending enable <yourdomain.com>
# the delivery events (delivered, bounced, complained, ...) arrive on a queue this Worker consumes: subscribe the mail-events queue to the domain's events
npx wrangler queues subscription create my-app-mail-events-prod --source email.sending --domain <yourdomain.com> --zone-id <zone-id> \
  --events message.delivered,message.deferred,message.bounced,message.failed,message.rejected,message.complained
```

The event names are the ones the package's parser reads (`cf.email.sending.message.*`); confirm the exact `--events` spelling against Cloudflare's Email Sending event-subscription page before the first
run (it is not verified here). Keep **"Drop suppressed recipients" OFF** (the default) in the sending settings: the package must see a suppressed recipient to record it. A mail the app sends
is one row of `notify_deliveries` (status, reason, the decision trace of each guard); the address is erased 30 days after the delivery finishes and the row after 90 (`retention.mailAddressDays`,
`mailLogDays`).

```bash
# operator-run: what was sent, skipped and why, today
npx wrangler d1 execute app-db-prod --remote --command \
  "SELECT message_id, channel, status, reason, COUNT(*) AS n FROM notify_deliveries WHERE created_at > (CAST(strftime('%s','now') AS INTEGER) - 86400) * 1000 GROUP BY 1,2,3,4 ORDER BY n DESC LIMIT 30;"
```

`skipped:no_sender` means no sender of the stream could carry it (the trace says why each declined: `no_mail_domain`, `no_email_binding`, an app's `when` reason); `skipped:suppressed` a bounce or a complaint remembered; `skipped:reserved_address` a `.test` or `example.*` address.
**Spend**: Email Sending is billed by volume: turn on the email spend alerts (next section).

## Observability, cost and what pages you

- **Logs and traces.** Both environments keep every log line (`head_sampling_rate: 1`: the portal reads them per shop and event) and sample traces at 5%. They share one monthly allowance on Workers Paid
  (logs and traces together with AI Gateway logs; **from 2026-12-01 it is counted by volume: 50 GB ingested and 10 GB-month stored included, then $0.25 per GB and $0.10 per GB-month**): read the current
  volume in the dashboard before then and lower `traces.head_sampling_rate` first if it grows.
- **Usage and AI cost** per shop are the `USAGE` Analytics Engine dataset (`services.usage.track`); the portal reads it by SQL.
- **Version.** Every log line, alert and Analytics point carries `version` (`CF_VERSION_METADATA`): an error is tied to the release that caused it.
- **Health, checked by the portal.** `/healthz` answers 200 while D1 and KV answer (503 otherwise) with the deploy's version and the latency of each, and never calls Shopify. The portal asks the same
  facts through the service binding (`AdminApi.system().health`, because that binding has no `fetch`), every five minutes, and tells staff after two failures in a row. Cloudflare Health Checks are
  not used (they need a Pro zone; this account is Workers Paid with a Free zone). An uptime monitor may call `/healthz` from outside as well.
- **Workers Issues and Monitors → the portal.** Cloudflare tells the PORTAL, not this app, when the Worker throws, answers 5xx or a threshold is crossed: create the webhook destinations and
  automations once per account as the portal's README says (`apps/portal/README.md`, section "Observability": Access bypass for `/webhooks/cloudflare/issues` and `/webhooks/cloudflare/monitors`,
  the two destinations signed with `cf-webhook-auth`, one Issues automation, the Monitors). **Name each automation and monitor after this Worker's script name** (the portal files an alert under the
  app whose script name it finds in the notification) and set `scriptName` for this app in the portal's `declared-apps.ts`. Suggested monitors: 5xx rate, error log lines per app, D1 size, mail deliveries that failed.
  Workflows `instance.errored` and Workers Builds `build.failed` reach the portal through Queues event subscriptions (the portal's side).
- **Spend alerts and Incident Alerts: alerts only, no hard limit.** Turn on the email **spend alerts** (Billing, Notifications, usage-based billing) and the **Incident Alerts** (Cloudflare's own
  incidents) once for the account. Do NOT set a hard spend limit: it applies to the whole account and would stop HTTP, cron, queues and email of production together.
- **Zone (Free plan).** The Free Managed Ruleset and the account's five custom rules are enough for the public form; skip them for the webhook paths and the app proxy (their bodies carry an HMAC). Not verified here.

## Previews

`npx wrangler preview` (wrangler 4.135 or later) deploys a branch of the Worker with the `previews` block of `wrangler.jsonc`: the shared STAGING D1, KV and R2 (fill the placeholder ids once; create the
staging database with the same migrations: `npx wrangler d1 migrations apply app-db-staging --remote`). A preview receives **no queue message, runs no cron and reaches no portal**, so webhooks, jobs, mail deliveries
and the portal's commands cannot be tried in one: those are tried in the tests (`workers/*.e2e.test.ts`) or on the staging Worker.

## Routine checks

Run the release checks before every deployment and retain their output with the release record. Alert on Worker errors, `job.dead_letter`,
a growing or dead `portal_outbox`, dead letters in `firesio_dead_letters`, DLQ depth, failed mail deliveries and D1 export failures (the portal hears of most of them: above). Thresholds, paging routes and dashboard ownership are decisions of the
adopting team.

```bash
npm run cf-typegen
npm run verify
CLOUDFLARE_ENV=production npm run build
npm run check:placeholders
```
