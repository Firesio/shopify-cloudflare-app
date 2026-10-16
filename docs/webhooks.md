# Receiving Shopify webhooks

How this template receives, stores and processes Shopify webhooks, why it is built that way, and how to add a topic
without breaking the guarantees. Verified facts and their sources are in
[`.claude/rules/shopify-api-invariants.md`](../.claude/rules/shopify-api-invariants.md); this page is the how-to.

## The rule in one line

**Verify the signature, put ONE durable message on the queue, answer 2xx. Everything else happens in the queue
consumer.**

## What Shopify requires

All of this is from Shopify's docs (links in the invariants file), not from experience:

| Requirement | Consequence here |
|---|---|
| Answer within **5 s** (1 s to connect); any non-2xx, **including 3xx**, is a failure | The request does no D1 work and calls no API. Only HMAC, header checks and one `queue.send` |
| Failed deliveries are retried **8 times over 4 hours**; then, for Admin-API subscriptions, the subscription is deleted. App-specific (`shopify.app.toml`) subscriptions are not deleted but that delivery is lost | A 2xx must mean "this delivery will not be lost". A failed `send` therefore answers 5xx so Shopify retries |
| Verify `X-Shopify-Hmac-SHA256` over the **raw body**, in constant time; a bad signature is **401** (compliance topics too) | `verifyShopifyWebhook` (`app/adapters/shopify-webhook.server.ts`); a bad signature is never turned into a 200 |
| Deduplicate on `X-Shopify-Webhook-Id` | It is the inbox primary key, so it is the idempotency key of the whole pipeline |
| Ordering is **not** guaranteed; use `X-Shopify-Triggered-At` | Carried as `triggeredAt`; handlers compare it (`decideUninstall`, `decideScopesUpdate`) |
| Do not rely on webhooks alone; run reconciliation jobs (`updated_at` filters) | The uninstall probe is the reconciliation for `app/uninstalled`. A topic that cannot be reconciled needs the strongest delivery guarantee (see "Compliance") |

## The pipeline

```
Shopify ──POST──▶ route (ring 5)                                   ◀── must finish inside 5 s
                  1. verifyShopifyWebhook      401 bad HMAC / 400 malformed
                  2. parse the typed values the handler needs (scopes) — 400 if the schema rejects it
                  3. enqueueWebhook            ONE queue.send, 5xx if it throws
                  4. 200
                       │
                       ▼   shopify-webhooks queue (at-least-once, DLQ after 8 retries)
                  consumeWebhook (workers/app.ts → webhookQueueDependencies)
                  a. admitWebhook     tombstone check → claim the inbox row (PK = webhook id) → record scopes
                  b. shop gate        discard for a redacted shop / run / defer an unknown shop
                  c. claim + lease    received|queued|failed → processing (exactly one worker wins)
                  d. handler          registry entry for the topic; throws → markFailed → queue retry
                  e. settle           processed, or dead_letter on delivery 9 (and the staff are told)
```

Files: `app/routes/webhooks/**` (routes + `enqueue.server.ts`), `app/services/webhook-ingest.ts` (receiver use case),
`app/services/webhook-admission.ts`, `app/services/webhook-consumer.ts`, `app/services/webhook-queue.ts` (retry/ack),
`app/services/webhook-handlers/*` (one file per topic), `app/wiring/webhooks.server.ts` (the registry and the queue
wiring), `app/ports/webhook-queue.ts` (the message shape).

### The queue message

`{ shop, id, intake: { topic, eventId, apiVersion, triggeredAt, receivedAt, payloadHash, scopes } }`.

The raw payload **never** travels: it can hold personal data, and the queue and DLQ retain messages for days. Only the
typed values a handler needs ride on `intake` (today only `scopes`, for `app/scopes_update`). The day a handler needs
more, add a field to `intake` and to `admitWebhook`'s recording step. Do not forward the body.

Cloudflare Queues messages are limited to **128 KB**, which every topic here is far below. See "Adding order/product
topics" for what changes when that stops being true.

### Why the request writes nothing to D1

The previous design wrote the inbox row, set it to `queued`, **then** sent to the queue. A worker that died between
the last two steps left a row that said "queued" with no message behind it; Shopify's retry then found the row, took
it for a duplicate, answered 200, and the webhook was lost. `catch` cannot help: a killed isolate throws nothing.
`ctx.waitUntil` is no fix either: it is bounded (about 30 s, shared) and unfinished work is cancelled.

With a queue send as the only write there is no in-between state. Either the message is on the queue (redelivered until
a consumer acknowledges it) or the send threw (5xx, Shopify retries). Duplicates are cheap and expected: admission is
idempotent on the webhook id.

## Handler rules

A handler is a function `(delivery) => Promise<void>` registered once in `webhookConsumer()`. TypeScript fails the
build for a topic without a handler (`Record<WebhookTopic, …>`).

1. **Idempotent.** The consumer is at-least-once. The same delivery can run again after a partial failure; a second
   run must finish the work, not repeat the effects.
2. **Order by Shopify's time, not ours.** Use `delivery.triggeredAt`. Never `Date.now()` for a fact Shopify timestamped.
3. **Throw to retry, return to finish.** A throw marks the delivery `failed` and the queue redelivers with backoff.
   Only throw for a failure that a later attempt can fix. A permanent failure (missing credential, a redacted shop)
   retried 8 times just dead-letters work that is otherwise done. This is why a failed post-uninstall reconciliation
   is **logged, not retried** (`recordUninstall`): "missing Partner credentials" never succeeds on retry.
4. **Never send mail or push inline.** Enqueue a notification (`Notifier` → notification queue). Give it a
   **deterministic `dedupeKey`** built from the delivery or the event (`shop-uninstalled:<shop>:<occurredAt>`,
   `webhook-dead-letter:<deliveryId>`), never a random one: the handler will run again and the key is what keeps the
   second run from announcing twice. A notification is decoration: catch its failure, log it, carry on.
5. **Announce before the steps that can fail.** `recordUninstall` announces right after the write and before cleanup
   and the Shopify reads. A retry finds the shop already uninstalled and returns before any announcement, so an
   announcement placed after a step that throws would be lost for good.
6. **Calling Shopify from a handler is fine** (it is outside the 5 s window) but needs a decision on transient vs
   permanent failure (rule 3), and a refresh of the offline token has the open per-shop serialisation gap recorded in
   the invariants file.
7. **No personal data in logs or notifications.** Ids and names only, shop by hash in logs.

## Topic classes

| | **A. Lifecycle & compliance** (today) | **B. Data sync** (order, product, …) — recommendation, not built |
|---|---|---|
| Topics | `app/uninstalled`, `app/scopes_update`, `shop/redact`, `customers/redact`, `customers/data_request` | `orders/*`, `products/*`, … |
| Volume | A handful per shop, ever | Potentially thousands per shop per day |
| Idempotency | Inbox row per delivery (admission) + state machine | **Upsert by resource id with a `triggeredAt` guard**: the payload is the full current state, so applying it twice, or an older one after a newer one, must not change the result. No row per delivery |
| Queue | `shopify-webhooks` | **Its own queue and DLQ** (bulkhead): a flash sale must not delay `shop/redact` or `app/uninstalled` |
| Consumer | One message at a time | Batch: `db.batch()` per queue batch (D1 is single-threaded; round trips are the cost) |
| Recovery | Probe / reconciliation + DLQ + staff alert | `updated_at`-filtered reconciliation job (Shopify's own recommendation) |
| Why | Rare and critical: an audit row and a visible failure are worth the writes | A row per delivery would grow without bound and make D1 the bottleneck |

### Adding order/product topics

Do these when the first such topic is added, not before:

1. **Reduce volume at the source**: `filter` in `shopify.app.toml` suppresses deliveries that do not match (a wrong
   field name suppresses *all* deliveries and still creates the subscription: test it), and subscribe only to topics
   the app uses.
2. **Check the payload size.** Shopify's docs I found state no payload limit. If a body can exceed ~100 KB, write it
   to R2 and send only the key (claim check). Do not build this before a topic needs it; log the body size meanwhile.
3. **Personal data.** Orders carry customer data: request the scope and protected-customer-data access (look it up
   with the Shopify skills), make `customers/redact` and `shop/redact` actually delete it, and decide how long the
   queue and DLQ may hold it.
4. Add a second queue (producer + consumer + DLQ) under the top level **and** `env.production`
   (named-env bindings are not inherited), a `queueKind` entry, and a topic→queue choice in the registry rather than an
   `if` in the route.

## Adding a topic (class A)

One new handler file, one registry entry, one test, plus the plumbing a webhook always needs:

1. `app/services/webhook-handlers/<topic>.ts` and its entry in `webhookConsumer()` (build fails until both exist).
2. The topic in `WebhookTopic` and `WEBHOOK_TOPICS` (`app/domain/webhook-delivery-lifecycle.ts`): does it need a shop
   record, and what happens for an unknown shop (`run` or `defer`)?
3. A route that ends in `enqueueVerifiedWebhook(authenticated, typedValues?)`, a route entry in `app/routes.ts`, a
   subscription in **both** `shopify.app.toml` and `shopify.app.dev.toml`. Validate the payload with a Zod schema at
   the route and answer 400 on a shape the handler cannot use (Shopify retries for 4 h, long enough to fix and deploy).
4. Tests: route (bad HMAC → 401, one queue message, **no D1 write in the request**), handler, and a
   **duplicate-delivery test proving exactly one effect** (`captureWebhookQueue()` + `consumeWebhook`).

## When something goes wrong

| Symptom | Where to look |
|---|---|
| Shopify says deliveries fail | The route answered non-2xx: `webhook.entry_failed` (5xx, queue refused), 401 (secret mismatch: see the rotation row), 400 (payload schema) |
| A delivery was accepted but nothing happened | `webhook_deliveries` row (`failed` / `dead_letter`), `GET /api/v1/webhooks/failures`, logs `webhook.queue` (`outcome`, `attempts`) |
| A delivery has **no row** at all | It never got past admission (D1 down for all 9 deliveries) and sits in the DLQ: there is no inbox row to see. The `webhook.queue` `failed` log lines are the trace. See `docs/OPERATIONS.md` |
| A delivery was dead-lettered | Staff with the **Webhook failed for good** topic get email and push (`webhook_dead_letter`); the row is `dead_letter` with the failure detail |
| An uninstall is missing | The probe finds it (hourly in production); `shopify.uninstall.reconciliation_failed` means only the billing/history re-read failed |

The 5 s budget: `compliance.enqueued` logs `durationMs` for the compliance route and `webhook.process` logs `latencyMs`
for every route. Alert if either approaches 5 s.

## Deploying this change over an older version

Messages the previous receiver enqueued are `{ shop, id }` with an inbox row already written. The consumer accepts
both shapes (`intake` is optional) and skips admission for the old one. Remove that tolerance after the queue has
drained (retries span hours; retention is configurable up to 14 days), together with the `queued` status that only the
old receiver wrote. There are no migrations.

Do not run a new receiver against an **old consumer**: an old consumer finds no inbox row for a new message and
acknowledges it as missing, which loses it. A plain `wrangler deploy` replaces the Worker as a unit (one script serves
`fetch` and `queue`); avoid gradual deployments for the release that introduces this. Not verified against a real
rollout.

## Not verified

- A real Shopify delivery through a deployed Worker: the whole path is tested with a local Queue binding and D1, with
  the queue consumer driven by hand. Cloudflare Queues itself was never exercised against redelivery or a killed worker.
- That `max_retries: 8` means nine deliveries: Cloudflare's page says the default is "retry three times", which implies
  N+1 deliveries but does not state it. `FINAL_QUEUE_ATTEMPT = 9` rests on that.
- That a resolved `queue.send` is durable: Cloudflare's pages do not state it; it is the documented, recommended way to
  hand off work that must not be lost.
- Latency: the "well under 5 s" claim is from the code path (one queue send), not measured on production.
