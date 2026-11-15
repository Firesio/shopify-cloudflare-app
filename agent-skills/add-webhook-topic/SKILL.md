---
name: add-webhook-topic
description: Subscribe to and handle a new Shopify webhook topic (handler in the router, both toml files, tests). Use when adding or changing a webhook topic or its consumer.
---

# Add a webhook topic

Source of truth: `docs/webhooks.md`; Shopify delivery facts in `docs/shopify-api-invariants.md` (see the `shopify-findings` skill). Look up the topic, its payload and its scope with the `shopify-plugin:*` skills before writing anything.

1. **Subscribe** in **both** `shopify.app.toml` and `shopify.app.dev.toml` (same URI under `/webhooks/...`). `routes/webhooks/receive.ts` is the ONE receiver for every topic: for the topics the preset owns (`firesio.handles`: `app/uninstalled` and the three GDPR ones) it verifies the HMAC, puts one message on the queue, answers 2xx and writes nothing. You add no route.
2. **Handle** a topic of the app's own in `receive.ts`, in its own branch after the `firesio.handles` line. The preset's queue consumer (`firesio.queue`) routes only the topics it owns and has NO extension point for another handler yet (no inbox, dedupe or ordering for it): until it has, a topic with real work verifies the HMAC itself (Shopify's `authenticate.webhook` where an Admin API session is needed, the raw-request `verifyWebhook` from `@firesio/app/shopify` where it is not: `docs/shopify-api-invariants.md` says why), does or enqueues the work on a queue and consumer of the app's own, and dedupes on the webhook id. The use case itself lives in `app/core/` and takes ports.
3. **Ordering**: Shopify does not order webhooks. A topic that changes state stores `orderKey(...)` next to what it applied and asks `decideOrder` (`@firesio/app/shopify`), as the uninstall does with the shop's `relationship_occurred_at`.
4. **Personal data** (orders, customers): needs a scope and protected-data access; set `customerData: { stores: true, dataRequest, redact }` in `createFiresio` (`app/firesio.server.ts`; the body then travels in the queue message) and make `customers/redact` and `shop/redact` really erase it.
5. **Tests**: the handler's effect, a **duplicate-delivery test proving exactly one effect**, and for a purge, a table in `app/db/schema.ts` with a `shop` column (the purge covers it; seed a row and assert it is gone). The receiver's own test (`routes/webhooks/receive.test.ts`: bad HMAC is 401, no D1 write) covers the preset's topics.
6. `npm run verify`.
