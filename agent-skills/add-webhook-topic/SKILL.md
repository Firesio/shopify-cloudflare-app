---
name: add-webhook-topic
description: Subscribe to and handle a new Shopify webhook topic (handler in the router, both toml files, tests). Use when adding or changing a webhook topic or its consumer.
---

# Add a webhook topic

Source of truth: `docs/webhooks.md`; Shopify delivery facts in `docs/shopify-api-invariants.md` (see the `shopify-findings` skill). Look up the topic, its payload and its scope with the `shopify-plugin:*` skills before writing anything.

1. **Subscribe** in **both** `shopify.app.toml` and `shopify.app.dev.toml` (same URI under `/webhooks/...`). `routes/webhooks/receive.ts` is the ONE receiver for every topic: it verifies the HMAC, puts one message on the queue, answers 2xx, and writes nothing. You add no route.
2. **Handle** the topic in `webhookRouter` (`app/wiring/webhooks.ts`): a handler per topic, validated with `typedHandler(schema, ...)` from `@firesio/shopify` when it reads the payload. The use case itself lives in `app/core/` and takes ports. A topic with no handler is settled as `unsupported_topic`.
3. **Ordering**: Shopify does not order webhooks. A topic that changes state stores `orderKey(...)` next to what it applied and asks `decideOrder` (`@firesio/shopify`), as the uninstall does with the shop's `relationship_occurred_at`.
4. **Personal data** (orders, customers): needs a scope and protected-data access; set `customerData: { stores: true, dataRequest, redact }` in `complianceDeps`, send the receiver `includePayload: true`, and make `customers/redact` and `shop/redact` really erase it.
5. **Tests**: the handler's effect, a **duplicate-delivery test proving exactly one effect** (`core/webhooks/consume.test.ts` is the pattern), and for a purge, a seeded row in `wiring/webhooks.test.ts`. The receiver's own test (bad HMAC is 401, no D1 write) already covers every topic.
6. `npm run verify`.
