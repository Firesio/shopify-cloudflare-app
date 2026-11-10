---
name: add-webhook-topic
description: Subscribe to and handle a new Shopify webhook topic (handler, registry entry, route, both toml files, tests). Use when adding or changing a webhook topic or its consumer.
---

# Add a webhook topic

Source of truth: `docs/webhooks.md` ("Adding a topic (class A)" and, for order/product volume, "Adding order/product topics"). Facts about Shopify delivery are in `docs/shopify-api-invariants.md` (see the `shopify-findings` skill). Look up the topic, its payload and its scope with the `shopify-plugin:*` skills before writing anything.

1. Handler `app/services/webhook-handlers/<topic>.ts` plus its entry in `webhookConsumer()`. The build fails until both exist.
2. Add the topic to `WebhookTopic` and `WEBHOOK_TOPICS` in `app/domain/webhook-delivery-lifecycle.ts`: does it need a shop record, and what happens for an unknown shop (`run` or `defer`)?
3. Route that ends in `enqueueVerifiedWebhook(...)`, an entry in `app/routes.ts` (webhooks group), and the subscription in **both** `shopify.app.toml` and `shopify.app.dev.toml` (same URI). Validate the payload with Zod at the route; answer 400 for a shape the handler cannot use.
4. The request writes nothing to D1: verify HMAC, one queue message, 2xx.
5. Tests: bad HMAC → 401; one queue message and **no D1 write in the request** (`captureWebhookQueue()` from `app/test/webhook-queue.ts`); the handler; and a **duplicate-delivery test proving exactly one effect** (`consumeWebhook`). Attempts and retries go through `webhookQueueDependencies()`.
6. Personal data (orders, customers): needs a scope and protected-data access, and `customers/redact` + `shop/redact` must delete it. High-volume topics (class B) need their own queue; read the doc before choosing.
7. `npm run verify`.
