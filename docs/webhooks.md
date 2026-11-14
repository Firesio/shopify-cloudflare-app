# Receiving Shopify webhooks

Shopify gives the receiver five seconds, treats anything but 2xx as a failure and retries (to 48 hours), and does not order or deduplicate deliveries.
So the receiver does one thing and the consumer the rest. The mechanics (HMAC, the inbox, ordering, the router, GDPR) are `@firesio/shopify`;
this page is how the template wires them.

```
Shopify ──POST──▶ routes/webhooks/receive.ts ──one message──▶ queue shopify-webhooks ──▶ workers/app.ts queue()
  401 on a bad HMAC; 2xx after the send         (writes nothing to D1)     DLQ after 8 retries       core/webhooks/consume.ts
                                                                                                      └ processWebhook: admit, claim, route, settle
```

## The receiver (`app/routes/webhooks/receive.ts`)

`verifyWebhook` (constant-time HMAC, POST only, `*.myshopify.com` only), `toQueuedWebhook`, `WEBHOOK_QUEUE.send`, 2xx. A bad signature stays a **401**
(an app-review check); a failed send answers 5xx so Shopify retries. Nothing is written to D1 in the request. The raw body is not queued (the inbox keeps a
hash): the customer GDPR topics carry personal data, and this template stores none (`customerData: { stores: false }`). Rotating the client secret: set
`SHOPIFY_API_SECRET_PREVIOUS` with `wrangler secret put` for the hour the rotation takes, then remove it.

## The consumer (`app/core/webhooks/consume.ts`, handlers in `app/wiring/webhooks.ts`)

For every message: `parseQueuedWebhook`, then `processWebhook`:

| Outcome | What happens |
|---|---|
| `processed`, `already_processed`, `in_progress`, `suppressed` | ack |
| `unsupported_topic`, `invalid_payload` | settled as a `failed` inbox row and acked (retrying cannot help) |
| `handler_failed`, `inbox_unavailable` | `retry({ delaySeconds: 30 })`, until the queue's DLQ takes it |

The inbox row (`webhook_deliveries`, keyed by the webhook id) is written by the consumer, so a delivery that arrives twice does its work once. A shop that was
redacted is dropped before any row is stored (the tombstone). Topics handled: `app/uninstalled` (`core/shops/lifecycle.ts`, emits `shop.uninstalled`) and the
three compliance topics (`customers/data_request`, `customers/redact`, `shop/redact`).

## `shop/redact` (`complianceDeps` in `app/wiring/webhooks.ts`)

1. `before` steps (idempotent, retried with the whole purge): the support rows and their R2 objects, the shop's KV sessions.
2. `commit`: ONE D1 batch: every shop-keyed table (`SHOP_SCOPED_DELETES`), the shop's outbox rows, the inbox row, the tombstone (a hash and a time, never the domain) and the
   `account.redacted` outbox row. Once it lands, a redelivery is `suppressed`.
3. The merchant installing again lifts the tombstone (`afterAuth`, `clearRedaction`): our own design, Shopify's docs say nothing about reinstalls.

## Adding a topic

See the `add-webhook-topic` skill: subscribe in both `shopify.app*.toml`, add the handler to `webhookRouter`, order it with `decideOrder` if it changes state, test the effect and a
duplicate delivery. High-volume topics (orders, products) need their own queue and DLQ so a flash sale never delays `shop/redact` or `app/uninstalled`.

## When it goes wrong

| Symptom | Where to look |
|---|---|
| Shopify reports a failing endpoint | The receiver's 401/5xx; `wrangler tail`; the signature secret (`SHOPIFY_API_SECRET`, `_PREVIOUS` during a rotation) |
| A delivery was dead-lettered | The DLQ `<slug>-webhooks-dlq-prod`; the inbox row is `failed` with the code and detail (`docs/OPERATIONS.md`, DLQ replay) |
| An event the portal never saw | `portal_outbox` (`pending`, `dead`) and the cron `outbox_drain` log line; `dead > 0` is the alert |
