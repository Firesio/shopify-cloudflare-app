---
paths:
  - "wrangler.jsonc"
  - "workers/**"
  - "drizzle/**"
  - "public/_headers"
---

# Cloudflare Workers

## The service list — closed by default

In scope means *allowed*, not *already wired*. Declare a binding when a feature
needs it; do not scaffold one speculatively.

| Service | Used for | Rule |
|---|---|---|
| **Workers** | The app (SSR) + webhooks | One Worker, one deployed env |
| **Static Assets** | Client bundle | The `assets` binding — not Pages |
| **D1** | All relational state | `@rules/data.md` |
| **KV** | Shopify sessions + hot read cache | Eventually consistent — never the source of relational truth. Shop-scoped keys, invalidate at the write site |
| **Queues** | Webhook → pipeline handoff | At-least-once ⇒ idempotent consumers, backoff that spans an outage (not a minute), and a **dead-letter queue**. A webhook route answers 2xx only after ONE `queue.send` and writes nothing to D1 first (`docs/webhooks.md`) |
| **Queues (portal events)** | `PORTAL_EVENTS` producer: the outbox drains into the portal's queue | Written reason: `docs/architecture.md` section 4 in the Firesio platform repo. Producer only; the portal's consumer owns the dead-letter queue (`portal-events-dlq`). Both environments name different queues (`portal-events`, `portal-events-prod`) |
| **Cron Triggers** | Outbox drain (every tick) and the daily snapshot and prune | One `scheduled` handler (`firesio.scheduled`); the preset's `worker/cron.ts` says what each cron string runs (`scripts/wrangler-bindings.test.mjs` pins it); each step guards its own errors so one failure never costs the others their tick |
| **Email Sending** | Customer replies and staff alerts | Verified sender domain from `vars`; failures are logged by event name and never lose a ticket |
| **Rate Limiting** | Support writes, the public form, inbound mail | Config-only binding, **fails closed** (the preset's `adapters/rate-limit.ts`), `docs/architecture.md` section 6.4 in the Firesio platform repo |
| **Email Routing + Email Workers** | Mail sent to the app's support addresses to the Worker's `email` handler | Receiving only. `firesio.email` (the Worker's `email` handler) is the entry; the decisions are `@firesio/app/support`'s |
| **Turnstile** | Bot check on the public support form | Verified server-side (the preset's `adapters/turnstile.ts`). The site key is a `var`; the secret is a Worker secret |
| **Observability** | Logs | `enabled: true` + `head_sampling_rate`, structured JSON |
| **Workers AI** | The support spam check (a decision model) | Binding only. Every call goes through `@firesio/app/ai`'s `AiService`, is metered into `ai_runs`, names a ROLE rather than a model, and is never on the correctness path (no answer opens the conversation) |
| **KV (portal blocklist)** | `PORTAL_BLOCKLIST`: the portal's blocklist and kill switch | READ-ONLY here, through `createBlocklistReader` (fail closed on anything on the mail path); the portal writes it |

**Everything else is out of scope until a written reason says otherwise** —
Durable Objects, Hyperdrive, Vectorize, Browser Rendering, Images,
Stream, Containers, Analytics Engine, Workers for Platforms. (The portal reaches this app through a service binding on the PORTAL's side: this app declares none.)
Adding a binding is an architecture decision, not a convenience — write down
*why* in the same change.

Two calls that recur and deserve a recorded answer rather than a reflex:

- **A queue consumer that needs the shop's offline session** finds it through `KVSessionStorage.findSessionsByShop`
  (which also reads it by id). KV is eventually consistent and caches a miss for about a minute, so right after a
  reinstall a session can read as missing. An INSTALLED shop with no readable session is **retried with a growing
  delay, never settled**; only an uninstalled or unknown shop settles. A listing never deletes an index entry.
  Evidence and what is unverified: `docs/shopify-api-invariants.md`, "Session lookup after a quick uninstall and
  reinstall".
- **Queues vs Workflows.** Queues fit enqueue-and-forget single steps.
  **Workflows** fit multi-step processes where each step must survive failure
  independently. Pick per pipeline, and say which and why.
- **R2** only once blobs actually exist. Nothing needs it by default.

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
- `compatibility_date` current, `nodejs_compat` enabled .
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
- **Webhooks: the route is `return firesio.webhook(request)`, handed the RAW `Request`.** The preset verifies the HMAC itself in constant time (`crypto.subtle.verify`; a bad one is a 401, never a 500), accepts `SHOPIFY_API_SECRET_PREVIOUS` during a rotation, enqueues and answers 2xx, and answers a topic it does not handle with a verified 200 (the preset's coming behaviour; until it is adopted `receive.ts` still asks `firesio.handles(topic)` first). **Never pass `firesio.shopify.authenticate.webhook`'s result to the preset for its topics**: that call refreshes the offline session and a failed refresh is a 500 (an uninstalled app's `app/uninstalled` hits exactly that), and it loses `SHOPIFY_API_SECRET_PREVIOUS`. A topic of the app's own that needs an Admin API session calls `authenticate.webhook` for THAT topic only, in its own branch. Evidence: `docs/shopify-api-invariants.md`.
- **No `passThroughOnException`.** Explicit `try/catch` and a structured error
  response.

## Deploy

`npm run cf:deploy` is the whole path: **verify → production build → D1
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
