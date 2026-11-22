---
paths:
  - "wrangler.jsonc"
  - "docs/OPERATIONS.md"
  - "workers/**"
  - "drizzle/**"
  - "public/_headers"
---

# Cloudflare Workers

## The service list — closed by default

In scope means *allowed*, not *already wired*. Declare a binding when a feature
needs it; do not scaffold one speculatively. **Every service has a written reason:
the one line in the "Why" column, the same change that declares the binding.**
Every binding is declared at the top level AND under `env.production`
(`scripts/wrangler-bindings.test.mjs` compares them).

| Service | Binding | Used for | Why (the reason in one line) and rule |
|---|---|---|---|
| **Workers** | | The app (SSR) + webhooks | One Worker, one deployed env. `limits.cpu_ms: 10000` caps a runaway loop below the 30 s default (wall time is not limited: a consumer may wait on Shopify). |
| **Static Assets** | `ASSETS` | Client bundle | Not Pages. `public/_headers` makes hashed files `immutable`; it never reaches a Worker response. |
| **D1** | `DB` | All relational state | `@rules/data.md`. Expand first, contract a release later: D1 does not roll back with the Worker. |
| **KV** | `SESSION`, `PORTAL_BLOCKLIST` | Shopify sessions + hot read cache; the portal's blocklist (READ-ONLY here, fails closed on the mail path) | Eventually consistent: never relational truth. Shop-scoped keys, invalidate at the write site. |
| **Queues (webhooks)** | `WEBHOOK_QUEUE` | Webhook to pipeline handoff | Why: Shopify wants a 2xx fast, so the request verifies the HMAC, puts ONE message and writes nothing to D1 (`docs/webhooks.md`). At-least-once: idempotent consumers, a DLQ, a retry that outlasts an outage. |
| **Queues (jobs)** | `JOBS_QUEUE` | ALL background work: the preset's periodic jobs, every event handler of `on`, the app's `jobs` | Why: one system with claims by (kind, dedupe key), retries, dead letters in D1 and a portal resend, instead of a hand-written queue per feature. `max_retries: 100` is the platform's ceiling on purpose: the job system counts attempts itself. `.claude/rules/jobs-and-flows.md`. |
| **Queues (notify)** | `NOTIFY_QUEUE` | A mail to send | Why: a delivery is recorded in D1 first, so a send is retried with the kernel's own backoff and survives a crash; without the binding it is sent in the turn that recorded it. `.claude/rules/notify.md`. |
| **Queues (mail events)** | consumer only | Email Sending's delivered / bounced / complained events | Why: a hard bounce or a complaint must suppress the address, or the next send repeats the harm. No producer here: the event subscription of the sending domain writes to it (`docs/OPERATIONS.md`, "Mail"). |
| **Queues (portal events)** | `PORTAL_EVENTS` | The outbox drains into the portal's queue | Written reason: `docs/architecture.md` section 4 in the Firesio platform repo. Producer only; the portal's consumer owns the dead-letter queue (`portal-events-dlq`). Both environments name different queues. |
| **Cron Triggers** | | One tick a minute, an hourly and a daily one | Why: they only TRIGGER. Each tick drains the outbox and enqueues the periodic jobs of its trigger, keyed by the time slot (a cron that fires twice is one job); the work is the jobs'. The preset's `worker/cron.ts` says what each string runs (`tools/architecture/wrangler-crons.test.ts` pins them). |
| **Workflows** | `FLOWS` (class `FiresioFlows`) | Multi-step processes that wait | Why: the uninstall, post-install and seat flows are a sequence of steps where each must survive failure alone and some sleep for days; a queue message cannot remember where it was. ONE class, exported from `workers/app.ts`, declared even while the app has no flow of its own. |
| **Durable Objects** | `SHOP_COORDINATOR` (class `ShopCoordinator`, SQLite) | One per shop: one token refresh at a time, a lease lock for a shop's writers | Why: Shopify's expiring offline tokens must be refreshed once, not by every concurrent isolate. Migration `v1` is `new_sqlite_classes`; a later class is migration `v2`, never an edit of `v1`. |
| **Analytics Engine** | `USAGE` | One data point per `services.usage.track` (AI tokens, what the app counts) | Why: counts and usage per shop belong in a metrics store the portal queries by SQL, not in log lines. |
| **Version metadata** | `CF_VERSION_METADATA` | The deploy's id and tag | Why: every log line, alert and Analytics point carries the version, so an error is tied to the release that caused it (and `wrangler rollback` has a target to name). |
| **Email Sending** | `EMAIL` (`send_email`) | Every mail the app sends: the `notifications` and `support` streams (`app/notifications/streams.ts`) | Why: native, no provider account, zero config after a clone. Transactional mail only (Cloudflare's terms): the team's announcements are service notices; mail on consent needs another provider. Failures are recorded per delivery, never lose a ticket. |
| **Rate Limiting** | `*_LIMITER` | Support writes, the public form, inbound mail, phone pairing | Config-only, **fails closed** (a missing or failing binding denies), `docs/architecture.md` section 6.4. |
| **Email Routing + Email Workers** | | Mail sent to the app's addresses to the Worker's `email` handler | Receiving only. `firesio.email` asks the app's `inbound.email` routes first, then the support inbox. |
| **Turnstile** | vars | Bot check on the public support form | Verified server-side; the site key is a var, the secret a Worker secret. |
| **R2** | `UPLOADS` | Support attachments, GDPR exports | Streamed, never buffered. Lifecycle rules per prefix (`tmp/` 1 day, `exports/` 8, `documents/` 30, `backups/` 30): `docs/OPERATIONS.md`. Never a bucket lock on a folder with personal data (a lock beats a lifecycle rule and blocks `shop/redact`). |
| **Observability** | | Logs and traces | Logs kept whole (`head_sampling_rate: 1`) because the portal reads them per shop; traces SAMPLED (0.05) because they share the logs' allowance and answer "which D1 call or fetch made this page slow" (`@rules/merchant-speed.md`). `redact_query_string` keeps `id_token` and `hmac` out. |
| **Workers AI** | `AI` | The support spam check (a decision model) and the app's AI features | Opt-in by import (`cloudflareAi()`), binding only. Every call goes through the AI kit, is counted into `USAGE`, names a feature rather than a model, and is never on the correctness path (no answer opens the conversation). `.claude/rules/ai.md`. |
| **Worker Previews** | `previews` block | A branch of the Worker before `main` | Why: a preview never touches production data: one shared STAGING D1, KV and R2. It receives no queue message, runs no cron and reaches no portal. |

**Everything else is out of scope until a written reason says otherwise** —
Hyperdrive, Vectorize, Containers, Workers for Platforms, Stream, and the
modules the package offers that the template does not use: Browser Run
(`BROWSER`, documents: PDF and printer-width PNG), Images (`IMAGES`), Flagship
(`FLAGS`), the Secrets Store (`SHARED_<NAME>`), the realtime Durable Object
(`FiresioRoom`, migration `v2`), D1 read replicas. Each is one binding and one
line of wiring in the package's README (`node_modules/@firesio/app/src/preset/README.md`,
"Cloudflare modules"). Adding one is an architecture decision, not a convenience —
write down *why* in the same change, in the table above.

Calls that recur and deserve a recorded answer rather than a reflex:

- **A queue consumer that needs the shop's offline session** finds it through the preset's `KVSessionStorage.findSessionsByShop`
  (`@firesio/app`; the consumer is the preset's too: an app's own handler gets `services.shopify.admin(shop)`). KV is eventually
  consistent and caches a miss for about a minute, so right after a reinstall a session can read as missing. An INSTALLED shop with
  no readable session is **retried with a growing delay, never settled**; only an uninstalled or unknown shop settles. Evidence and
  what is unverified: `docs/shopify-api-invariants.md`, "Session lookup after a quick uninstall and reinstall".
- **A queue of the app's own** is the preset's to consume: its handler goes in `queues` of `createFiresio` (built in
  `app/wiring/<feature>.ts`; a retry policy is `message.retry({ delaySeconds: 30 * message.attempts })`), and its dead-letter
  queue in `deadLetterQueues` (`{ "<slug>-billing-dlq": true }`: each message is COPIED INTO D1 (`firesio_dead_letters`, 30 days, resendable from
  the portal), one `app.alert` goes to the portal, acknowledged). Declare both under `queues.consumers` (top level AND
  `env.production`, the main one naming its `dead_letter_queue`). Prefer a JOB (`defineJob`): same queue, claims and dead letters, no
  consumer to write. A name that is one of the preset's own queues throws when `createFiresio` is called.
- **Queues vs Workflows.** Queues fit enqueue-and-forget single steps (a job). **Workflows** fit multi-step processes where
  each step must survive failure independently or wait (a flow). Pick per pipeline, and say which and why.
- **Dead-letter retention.** A dead-letter queue nobody consumes keeps a message 4 days; create every queue with
  `--message-retention-period-secs 1209600` (14 days), and the preset's consumer copies each dead letter into D1 anyway.

## Limits that change the design

- **128 MB per isolate** → stream bodies (`response.body`, `TransformStream`);
  never `await response.text()` on unbounded data.
- **CPU 30s default** (raisable), **15 min wall** for queue/cron consumers, but
  **`waitUntil` only ~30s** → long work belongs in a Queue, never in
  `waitUntil`.
- **Subrequests are capped per invocation, and only ~6 connections may wait on
  headers at once** → never one Shopify or D1 call per row. Batch, or move the
  fan-out into a consumer.
- **10 MB compressed script** → no bundling a library you use one function of.

## Config

- **`wrangler.jsonc`**, not TOML — newer platform features are JSON-only.
- `compatibility_date` is the package's shared date (`COMPATIBILITY_DATE` of `@firesio/app`, `tools/architecture/compatibility-date.test.ts`), `nodejs_compat` enabled.
- **`wrangler types` generates `Env`. Never hand-write a binding interface** — it
  drifts from config silently.
- **Named-env bindings are NOT inherited.** Every binding, `var`, trigger, and
  observability block is re-declared under the production env. A forgotten one is
  *absent* in production, not inherited. `main`, `compatibility_date`,
  `compatibility_flags` and `assets` are the exceptions that DO inherit.
- **A placeholder id must never survive into a deployed env.** The top-level
  config is local dev (Miniflare simulates bindings by name and ignores ids), so
  those ids are deliberately fake. Check the real ones are in the production env
  before deploying.
- Secrets via `wrangler secret put` / Secrets Store, **never** in config or
  source. Public config (domains, scopes, client id) lives in `vars`, committed on
  purpose, so a domain move is a config edit and nothing in `app/` holds a
  hostname.
- `custom_domain: true` when the Worker is the origin.

## Runtime invariants

- **Bindings, never the Cloudflare REST API** from inside a Worker.
- **Never destructure `ctx`** (`const { waitUntil } = ctx`) — it loses `this` and
  throws *Illegal invocation* at runtime.
- **No floating promises.** Every promise is awaited, returned, or handed to
  `ctx.waitUntil()`. `@typescript-eslint/no-floating-promises` is the gate.
- **No module-level mutable state** — an isolate is reused across shops
  (`@rules/core.md`).
- **`env` from `cloudflare:workers` (`firesio.services()`), never `process.env`** — workerd does not populate it. A handler that is handed `env` (`scheduled`, `queue`, `email`, the AdminApi) passes it on (`firesio.queue(batch, env)`); the preset builds the services once per `env`.
- **`crypto.getRandomValues()` / `crypto.randomUUID()`, never `Math.random()`**
  for anything security-bearing (in the app's own code ids come from the preset's runtime: `randomUUID` is lint-banned outside tests). Compare secrets and signatures in constant time, never `===`.
- **`env.production` re-declares EVERYTHING that is not inherited**: bindings, `observability` (with `traces`), `limits`, `triggers`, `vars`, `secrets`, `workflows`, `durable_objects`, `migrations`. Only `main`, `compatibility_date`, `compatibility_flags` and `assets` are inherited.
- **Webhooks: the route is `firesio.webhookRoute` (its `action` is `firesio.webhook(request)`, handed the RAW `Request`, with no branch on the topic).** Never hand the preset the result of `authenticate.webhook`. The reasons, the consumer and how to add a topic: `docs/webhooks.md`; the evidence: `docs/shopify-api-invariants.md`.
- **No `passThroughOnException`.** Explicit `try/catch` and a structured error
  response.

## Deploy

A push to `main` deploys by itself (Workers Builds: the build command runs `npm run verify && npm run build`, then the D1 migrations, then `wrangler deploy`; `docs/OPERATIONS.md`). `npm run cf:deploy` is the manual path: **verify → production build → D1
migrations → deploy**, in that order. Migrations land *before* the worker, so
code never runs ahead of its schema.

**Build and deploy are one command on purpose. Never split them.**
`@cloudflare/vite-plugin` resolves the environment at **build** time and bakes it
into `build/server/wrangler.json`. `CLOUDFLARE_ENV=production` during the build
is what selects the production env — `wrangler deploy --env production` on a dev
build silently ignores the flag and ships localhost vars with placeholder
binding ids. This is a real, reproducible failure, not a theoretical one.

**npm is the only package manager.** A CI builder picks its installer from the
lockfiles it finds, so a stray `yarn.lock` or `pnpm-lock.yaml` silently changes
the build.

**Migration filenames are the applied key** (`d1_migrations` records them by
name). Never rename or renumber an applied migration; forward-only, always.
