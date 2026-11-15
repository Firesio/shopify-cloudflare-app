# Receiving Shopify webhooks

Shopify gives the receiver five seconds, treats anything but 2xx as a failure and retries (to 48 hours), and does not order or deduplicate deliveries.
So the receiver does one thing and the consumer the rest. The mechanics (HMAC, the inbox, ordering, the router, GDPR) are `@firesio/app/shopify`, wired by the preset (`createFiresio`);
this page is how the template uses them.

```
Shopify ──POST──▶ routes/webhooks/receive.ts ──one message──▶ queue my-app-webhooks ──▶ workers/app.ts queue()
  401 on a bad HMAC; 2xx after the send         (writes nothing to D1)     DLQ after 8 retries       firesio.queue (preset worker/consume.ts)
                                                                                                      └ processWebhook: admit, claim, route, settle
```

## The receiver (`app/routes/webhooks/receive.ts`)

`firesio.handles(topic)` reads the `X-Shopify-Topic` header; for a topic the preset owns, `firesio.webhook(request)` runs `verifyWebhook` (constant-time HMAC, POST only, `*.myshopify.com` only), `toQueuedWebhook`, `WEBHOOK_QUEUE.send`, 2xx. It is handed the RAW request, not the result of Shopify's `authenticate.webhook`, on purpose: that call refreshes the offline session and turns a refresh failure into a 500 (`docs/shopify-api-invariants.md`), which is exactly what an uninstalled app's `app/uninstalled` hits. A bad signature stays a **401**
(an app-review check); a failed send answers 5xx so Shopify retries. Nothing is written to D1 in the request. The raw body is not queued (the inbox keeps a
hash): the customer GDPR topics carry personal data, and this template stores none (`customerData: { stores: false }`). Rotating the client secret: set
`SHOPIFY_API_SECRET_PREVIOUS` with `wrangler secret put` for the hour the rotation takes, then remove it.

## The consumer (`firesio.queue`: the preset's `worker/consume.ts` and `services/webhooks.ts`)

For every message: `parseQueuedWebhook`, then `processWebhook`:

| Outcome | What happens |
|---|---|
| `processed`, `already_processed`, `in_progress`, `suppressed` | ack |
| `unsupported_topic`, `invalid_payload` | settled as a `failed` inbox row and acked (retrying cannot help) |
| `handler_failed`, `inbox_unavailable` | `retry({ delaySeconds: 30 })`, until the queue's DLQ takes it |

The inbox row (`webhook_deliveries`, keyed by the webhook id) is written by the consumer, so a delivery that arrives twice does its work once. A shop that was
redacted is dropped before any row is stored (the tombstone). Topics handled: `app/uninstalled` (the preset's `shops/lifecycle.ts`, emits `shop.uninstalled`) and the
three compliance topics (`customers/data_request`, `customers/redact`, `shop/redact`).

## `shop/redact` (the preset's `services/webhooks.ts` and `purge/`)

1. `before` steps (idempotent, retried with the whole purge): the support rows and their R2 objects, the shop's KV sessions.
2. `commit`: ONE D1 batch: every shop-keyed table (the libraries' fixed list, then every table of the preset's schema and of the app's `schema` option that has a `shop` column; `purge.shopScoped` and `purge.keep` adjust it), the shop's outbox rows, the inbox row, the tombstone (a hash and a time, never the domain) and the
   `account.redacted` outbox row. Once it lands, a redelivery is `suppressed`.
3. The merchant installing again lifts the tombstone (`afterAuth`, `clearRedaction`): our own design, Shopify's docs say nothing about reinstalls.

## Adding a topic

Always, whichever way below: subscribe in **both** `shopify.app.toml` and `shopify.app.dev.toml` (the preset never subscribes for you), and look the topic, its payload and its scope up first. Shopify does not order webhooks: a topic that changes state stores `orderKey(...)` and asks `decideOrder` (`@firesio/app/shopify`). Details and the test list: the `add-webhook-topic` skill.

Three ways to handle a topic of the app's own, from the default to the most freedom:

| Way | When | What you get | What you write |
|---|---|---|---|
| **1. `webhooks` option of `createFiresio`** (default) | Almost every topic | HMAC and host check, one queue message, claim by the Shopify webhook id (a redelivery runs once), retry, DLQ, dropped for a redacted shop; `receive.ts` needs no change (`firesio.handles` knows the key) | `webhooks: { "orders/paid": async (delivery, services) => useCase(...) }` in `app/firesio.server.ts`; the use case in `app/core/` |
| **2. Own branch in `receive.ts`** | The topic must be answered in the request, or needs Shopify's webhook session right there | Nothing from the preset for that topic | `if (topic === "products/update") { const { admin, payload } = await firesio.shopify.authenticate.webhook(request); ... }`, BEFORE nothing else touches the request; never pass that result to `firesio.webhook` (`docs/shopify-api-invariants.md`: a failed session refresh is a 500); your own dedupe |
| **3. Own queue** | High volume (orders, products) or batch work, so a flash sale never delays `shop/redact` or `app/uninstalled` | Isolation | A queue and DLQ in `wrangler.jsonc` (top level AND `env.production`), the route sends to it, `workers/app.ts` `queue()` routes that queue's batches to your consumer and every other batch to `firesio.queue` |

- **Calling the Admin API from a handler (way 1):** `services` has no Admin client; use `firesio.shopify.unauthenticated.admin(delivery.shop)` (the offline session from `SESSION`). Keep it out of the request path.
- **Idempotency:** the preset runs a delivery once, but a handler that throws half way is retried: make what it does idempotent (upsert by the webhook id or the resource id).
- **Personal data** (orders, customers): needs the scope and protected-data access, and `customerData: { stores: true, dataRequest, redact }`; tables with a `shop` column are purged on `shop/redact` automatically, other keying columns go in `purge.shopScoped`.

### Queue names (app that already runs in production)

`firesio.queue` consumes only the queues in `webhookQueues`; the default is `<slug>-webhooks` / `<slug>-webhooks-prod`, which is what `npm run new-app` creates. An app that moves onto the preset with queues named otherwise lists ITS names (`webhookQueues: ["...", "..."]`) instead of recreating queues: a batch from a queue not in the list is retried forever and never acknowledged. Queue names are unique per Cloudflare account and one queue has one consumer, so never reuse another app's name.

## When it goes wrong

| Symptom | Where to look |
|---|---|
| Shopify reports a failing endpoint | The receiver's 401/5xx; `wrangler tail`; the signature secret (`SHOPIFY_API_SECRET`, `_PREVIOUS` during a rotation) |
| A delivery was dead-lettered | The DLQ `<slug>-webhooks-dlq-prod`; the inbox row is `failed` with the code and detail (`docs/OPERATIONS.md`, DLQ replay) |
| An event the portal never saw | `portal_outbox` (`pending`, `dead`) and the cron `outbox_drain` log line; `dead > 0` is the alert |
