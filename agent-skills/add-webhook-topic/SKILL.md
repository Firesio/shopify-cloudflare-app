---
name: add-webhook-topic
description: Subscribe to and handle a new Shopify webhook topic (handler in the router, both toml files, tests). Use when adding or changing a webhook topic or its consumer.
---

# Add a webhook topic

Source of truth: `docs/webhooks.md`; Shopify delivery facts in `docs/shopify-api-invariants.md` (see the `shopify-findings` skill). Look up the topic, its payload and its scope with the `shopify-plugin:*` skills before writing anything.

1. **Subscribe** in **both** `shopify.app.toml` and `shopify.app.dev.toml` (same URI under `/webhooks/...`). `routes/webhooks/receive.ts` is the ONE receiver for every topic: for every topic `firesio.handles` knows (`app/uninstalled`, the three GDPR ones and the keys of the app's `webhooks`) it verifies the HMAC from the raw request, puts one message on the queue, answers 2xx and writes nothing. You add no route and no queue.
2. **Handle** a topic of the app's own as a key of the `webhooks` option of `createFiresio` in `app/firesio.server.ts`: `webhooks: { "orders/paid": async (delivery, services) => { ... } }`, keyed by the topic in Shopify's path form. The preset's queue consumer runs it through the same inbox as its own topics: claimed by the Shopify webhook id (a redelivery runs it once), retried when it throws until the DLQ takes it, dropped for a redacted shop. `services` is `AppWebhookServices` (`db`, `shops`, `portal`, `billing`, ... `env`); the body travels in the queue message, so a topic with personal data needs the scope and protected-data access. The use case itself lives in `app/core/` and takes ports; the handler is a few lines that call it. Make it idempotent anyway if it calls out. Admin API from the handler: `firesio.shopify.unauthenticated.admin(delivery.shop)` (`services` has no Admin client). Do NOT hand the preset the result of `authenticate.webhook` (`docs/shopify-api-invariants.md`): a topic that needs an Admin API session calls it in its own branch of `receive.ts` for that topic only.
3. **Ordering**: Shopify does not order webhooks. A topic that changes state stores `orderKey(...)` next to what it applied and asks `decideOrder` (`@firesio/app/shopify`), as the uninstall does with the shop's `relationship_occurred_at`.
4. **Personal data** (orders, customers): needs a scope and protected-data access; set `customerData: { stores: true, dataRequest, redact }` in `createFiresio` (the body of the customer topics then travels in the queue message) and make `customers/redact` and `shop/redact` really erase it.
5. **Tests**: the handler's effect, a **duplicate-delivery test proving exactly one effect** (send the same delivery twice through `firesio.queue(batch, env)`), and for a purge, a table in `app/db/schema.ts` with a `shop` column (the purge covers it; seed a row and assert it is gone). The receiver's own test (`routes/webhooks/receive.test.ts`: bad HMAC is 401, no D1 write) covers the preset's topics.
6. **High volume** (orders, products): its own queue and DLQ (`docs/webhooks.md`, way 3), so it never delays `shop/redact`.
7. **Queue names**: the topic needs no new queue in ways 1 and 2. An existing app moving onto the preset keeps its production queue names through `webhookQueues` (`docs/webhooks.md`, "Queue names").
8. `npm run verify`.
