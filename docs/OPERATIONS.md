# Operations runbook

This guide is for the operator of an app made from this template, after its production resources and credentials have been
provisioned (`npm run new-app` lists them). It does not provide a deploy workflow for a particular CI provider: choose an
organization-specific identity, approval, audit-log and rollback policy before automating any of these steps.

What runs in production is the template's Worker (`workers/app.ts`) with the `@firesio/app` preset behind it: the webhook queue
consumer, the cron, the support mail handler and the `AdminApi` the portal calls. What the preset does at each step is documented in
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
| `PARTNER_API_TOKEN` | A Partner API token that reads this app's subscription (Managed Pricing). The preset treats it as optional (without it the subscription refresh reports `not_configured` and every shop stays on the free plan); **this template requires it**, because the plan a shop is on is the product. |

Optional and NOT declared (a name in `secrets.required` is a deploy-time requirement): `TURNSTILE_SECRET_KEY` (the support form's
bot check; `TURNSTILE_SITE_KEY` is the public var), `SHOP_CUSTOM_DOMAIN` (only an app that serves a shop's custom domain),
`SHOPIFY_API_SECRET_PREVIOUS` (only during a rotation, below), `SETTINGS_SECRET_KEY` (seals the `secret()` fields of the `settings` library at rest, AES-256-GCM; base64 of 32 random bytes; without it they are stored as plain text, and adding it later needs no migration: the next save seals them; `SETTINGS_SECRET_KEY_ID` and `SETTINGS_SECRET_KEY_PREVIOUS` with its `_ID` serve a rotation). The template declares no `settings`, so it has no use for it until an app adds them.

Everything else is a var in `wrangler.jsonc`, committed on purpose: `SHOPIFY_API_KEY` (the public client id), `SCOPES`,
`SHOPIFY_APP_URL`, `SHOPIFY_APP_HANDLE`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `STAFF_ALERT_EMAIL`, `SUPPORT_MAIL_DOMAIN`,
`TURNSTILE_SITE_KEY`, `AI_GATEWAY_ID`, `EVENT_HASH_KEY_ID`, `PARTNER_ORG_ID`, `PARTNER_APP_ID`. Their names must be in
`wrangler.jsonc` so `Env` can be generated on a clean checkout (`npm run cf-typegen`); the values of secrets live only in the
secret store and, locally, in `.dev.vars`.

## Automatic deploys from `main` (Workers Builds)

When the Worker is connected to its GitHub repository in Cloudflare Workers Builds, **every push to the configured branch builds
and deploys production**. The settings (Workers & Pages > the Worker > Settings > Builds) are:

| Setting        | Value                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Branch         | `main`                                                                                         |
| Build command  | `npm run build`                                                                                |
| Deploy command | `npx wrangler deploy`                                                                          |
| Build variable | `CLOUDFLARE_ENV=production` (selects `env.production`; without it the build bakes local config) |

`npm run build` runs `scripts/ci-release.mjs` after the Vite build. It acts only inside Workers Builds (`WORKERS_CI`): it first runs
`npm run check:placeholders` (fatal: a placeholder, a route, queue or webhook that drifted stops the build before anything is applied), then applies
the D1 migrations to the production database `wrangler.jsonc` names under `env.production` (fatal on failure, so code never lands ahead of its schema) and then, best effort, deploys the Shopify app
config with the repository's pinned Shopify CLI, only when the commits touched `shopify.app.toml` or `extensions/`. Two optional
build variables: `D1_MIGRATIONS_API_TOKEN` (a token that may edit D1, used for the migration step when the build's own token may not)
and `SHOPIFY_APP_AUTOMATION_TOKEN` (without it the Shopify deploy is skipped; the build never logs anything about its value).
`@react-router/dev` is a devDependency: the build runs after `npm ci`/`npm clean-install`, which installs devDependencies (the Vite, Cloudflare and Wrangler tooling the build needs are devDependencies too), so it needs no special setting. The build does **not** run `npm run verify`: run it
(or `npm run cf:deploy`) before pushing to `main`; CI (`.github/workflows/verify.yml`) runs it only on a pull request that touches code,
on a `template-v*` tag (a derived app picks its own pattern in `verify.yml`) or by hand. Runtime secrets are not build variables; they stay on the Worker. Installing the private `@firesio`
packages in the build needs `NPM_TOKEN` as a build variable (a read-only `read:packages` token); that this works in Workers Builds is not
yet verified, so check the first build.

## Roll back safely

A Worker rollback does not roll back a D1 schema or data change. First decide whether the incident is code-only or needs a data
recovery plan.

```bash
# operator-run: inspect available releases, then choose a known-good version ID
npx wrangler deployments list --env production
npx wrangler rollback <known-good-version-id> --env production \
  --message "Rollback: <incident reference>"

# operator-run: observe the recovered release; filter to known failure events
npx wrangler tail --env production --format json --status error
```

If the failed release includes a migration, keep the old Worker compatible with the newer schema or ship a forward corrective
migration. Do not apply an old migration file in reverse without an approved, tested recovery plan.

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

## Scheduled work (cron) and R2

Production has two crons (`triggers.crons`, re-declared under `env.production`; the preset's `worker/cron.ts` knows exactly these
two strings and `scripts/wrangler-bindings.test.mjs` pins them):

- `* * * * *`, every minute: **drains the portal outbox** into the `portal-events-prod` queue (up to 50 events a run). Nothing else.
- `30 3 * * *`, daily: the same drain, then the **daily metrics snapshot** (yesterday's counts, sent as one `metrics.snapshot` event) and
  the **prune**: sent outbox rows older than a week, spent usage counters, and expired support uploads. The sweep deletes the R2 objects before
  their D1 rows, so a failed object deletion stays retryable on the next daily tick.

Development has one cron, `*/5 * * * *`, which runs both (the daily work runs on every tick that is not the drain-only one).

Each step logs one line, `cron.step` with `step` (`outbox_drain`, `metrics_snapshot`, `prune`) and its counts, or `cron.step_failed` with
the step name when it threw; a failed step does not stop the next one and is repaired by the next tick. Investigate `cron.step_failed` and the
event-specific log lines before touching data by hand.

```bash
# operator-run: stream structured step failures from the deployed Worker
npx wrangler tail --env production --format json --search cron.step_failed

# operator-run: inspect expired pending-upload rows before remediation
npx wrangler d1 execute app-db-prod --remote --command \
  "SELECT id, r2_key, expires_at FROM pending_uploads WHERE expires_at <= CAST(strftime('%s','now') AS INTEGER) * 1000;"

# operator-run: verify one expected object exists without exposing it publicly
npx wrangler r2 object get app-support-uploads-prod/<object-key> --remote \
  --file /tmp/upload-verification.bin
```

Do not run a broad R2 deletion to "clean up" failed uploads. Use the row and object key from the investigation, preserve incident
evidence and let the scheduled sweep retry whenever possible.

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

## Webhook DLQ investigation and replay

The deployment declares `my-app-webhooks-prod` with `my-app-webhooks-dlq-prod` as its dead-letter queue, after 8 retries
(`max_retries` in `wrangler.jsonc`). The path of a delivery is in [Receiving Shopify webhooks](webhooks.md); what matters for the DLQ:

- A message is the one the receiver queued: the shop, the Shopify webhook id and an `intake` (topic, event id, API version, trigger time, payload
  hash). The body travels only for the app's own topics (the `webhooks` option) and, for the customer topics, only when `customerData.stores`
  is true; the GDPR topics of a template that stores no customer data carry no payload. Treat what it holds as potentially sensitive.
- The consumer retries a delivery whose handler threw, or whose inbox could not be written, after a delay that doubles with each attempt (30 seconds, then 60, ... at most an hour) until the queue gives up. A handler
  that failed leaves its `webhook_deliveries` row `failed`, with `attempts`, `failure_code` (`handler_failed`) and `failure_detail`. A message that
  never got past the inbox (D1 unavailable for all the attempts) has **no row**: only the `webhook.retry` log lines and the DLQ itself record it. An
  unknown topic or a payload that does not fit is not retried: it is settled as a `failed` row and acknowledged, so it never reaches the DLQ.
- This Worker consumes the DLQ too (`wrangler.jsonc` declares `my-app-webhooks-dlq-prod` as a consumer, and the preset's `webhookDeadLetterQueues` names it): each
  message that lands there is **acknowledged** after its inbox row is marked `dead_letter` (with the topic and a hash of the shop in a `webhook.dead_letter`
  log line, never the domain), so a dead delivery is recorded instead of sitting unread. The app itself sends staff no alert about it: watch the
  `webhook.dead_letter` log lines, the `dead_letter` rows and the `failed` ones. A message that never got past the inbox has no row to mark: the log line is
  its record.

```bash
# operator-run: DLQ backlog and consumer configuration
npx wrangler queues info my-app-webhooks-dlq-prod
npx wrangler queues consumer list my-app-webhooks-dlq-prod

# operator-run: the failed and dead-lettered deliveries the inbox knows
npx wrangler d1 execute app-db-prod --remote --command \
  "SELECT id, topic, shop, status, attempts, failure_code, failure_detail FROM webhook_deliveries WHERE status IN ('failed', 'dead_letter') ORDER BY received_at DESC LIMIT 50;"
```

Wrangler reports queue metadata and attaches or removes a consumer, but it has no command to read or replay individual messages. Replay works
through the inbox, and it is idempotent by design: a message put back on `my-app-webhooks-prod` is claimed by its webhook id, a delivery already
`processed` is acknowledged without running again (`already_processed`), a `failed` or `dead_letter` one is taken over and run again, and a delivery for a redacted
shop is dropped (`suppressed`). So a replay is "forward each message, unchanged, to the main queue" once the cause is fixed and deployed.

**This template records dead letters and does not keep them.** Its Worker consumes the DLQ and acknowledges each message once the row is marked, so the
queue holds nothing to forward: what survives is the `dead_letter` row (topic, shop, webhook id, attempts) and the `webhook.dead_letter` line. For a delivery
whose body travelled in the message (an app's own topics) that is the only trace; the inbox keeps a hash, not the payload. An app that must keep the messages for a replay changes that on purpose, in one commit: no DLQ consumer in `wrangler.jsonc` (both environments),
`webhookDeadLetterQueues: []` in `app/firesio.server.ts`, and `queueNameIssues` (`scripts/launch-config-checks.mjs`) with `scripts/wrangler-bindings.test.mjs`.
The queue then keeps the messages (Cloudflare's retention) and nothing records them; the procedure is:

1. Deploy the fix and check that the deployed handler accepts the stored message shape (a handler with an external effect needs its own idempotency:
   the inbox guarantees one claim per delivery, not one effect per attempt).
2. With the owner's approval, attach a small reviewed Worker as a temporary consumer of the DLQ. It has a producer binding to `my-app-webhooks-prod`
   and its `queue` handler sends each `message.body` to it unchanged (batch size 1, concurrency 1), acknowledging only after the send. Remove the
   consumer when the DLQ is empty. (The production Worker must not be that consumer: its `queue` handler consumes only the queues of `webhookQueues`
   and `webhookDeadLetterQueues`, and a batch from any other queue is retried whole and never acknowledged, `queue.unknown`.)

```bash
# operator-run, changes delivery: attach the approved replay Worker temporarily
npx wrangler queues consumer add my-app-webhooks-dlq-prod <replay-worker-name> \
  --batch-size 1 --max-concurrency 1

# operator-run, changes delivery: remove that temporary consumer after the replay window
npx wrangler queues consumer remove my-app-webhooks-dlq-prod <replay-worker-name>
```

Record the delivery ids, operator, start and end time and outcome (`webhook.settled` log lines, and the rows now `processed`). Never purge the DLQ
as an incident response step: that discards the evidence and the work to recover. Shopify does not replay a delivery for you once its own retries
(up to 8 over 4 hours) are spent; compliance deliveries (`shop/redact` and the customer topics) have a 30-day window.

## Routine checks

Run the release checks before every deployment and retain their output with the release record. Alert on Worker errors, `cron.step_failed`,
a growing or dead `portal_outbox`, DLQ depth and D1 export failures. Thresholds, paging routes and dashboard ownership are decisions of the
adopting team.

```bash
npm run cf-typegen
npm run verify
CLOUDFLARE_ENV=production npm run build
npm run check:placeholders
```
