# Porting guide: queue-first webhook receiver (2026-10-16)

For an app created from the template. Design and reasoning: [`docs/webhooks.md`](../webhooks.md); verified facts and
what is still unverified: `.claude/rules/shopify-api-invariants.md` ("Queue-first receiver…").

## What changed

| | Before | After |
|---|---|---|
| Request | verify, tombstone check, claim row, mark queued, `queue.send`, mark queued, log | verify, `queue.send`, log. **No D1** |
| Inbox row | written by the request | written by the consumer (`admitWebhook`) |
| Message | `{ shop, id }` | `{ shop, id, intake }` (`intake` optional on read) |
| Final retry | dead-lettered on delivery 8 of 9 (`attempts` was incremented twice) | delivery 9 |
| Dead letters | silent | staff notification `webhook_dead_letter` |
| Uninstall | announced after cleanup and reconciliation | announced right after the write |

## Files

- Receiver: `app/routes/webhooks/enqueue.server.ts` (new), `app/routes/webhooks/{compliance,app/uninstalled,app/scopes-update}.tsx`, `app/services/webhook-ingest.ts` (rewritten: `enqueueWebhook`, `parseTriggeredAt`, `sha256Json`)
- Consumer: `app/services/webhook-admission.ts` (new), `app/services/webhook-consumer.ts` (`admit`, `onDeadLetter`, `deadLetter`), `app/ports/webhook-queue.ts` (`WebhookIntake`), `app/ports/webhook-deliveries.ts` (only `WebhookDeliveryInput` remains)
- Wiring: `app/wiring/webhooks.server.ts` (`admit`, `onDeadLetter`, new `webhookQueueDependencies`), `app/wiring.server.ts` (export), `workers/app.ts` (uses `webhookQueueDependencies()`; the `+ 1` is gone)
- Removed: `WebhookDeliveryRepo.markQueued / claimForQueue / markReceived`, the `queue` lifecycle event, `WebhookDeliveriesPort`
- Uninstall: `app/services/record-uninstall.ts` (announce earlier), `reconcile-after-uninstall.ts` (comment)
- Dead-letter alert: topic `webhook_dead_letter` (`staff-notification-topics.ts`, new group `system`), event in `app/notifications/{types,catalogue,payloads,envelope}.ts`, `channels/push/builders.ts`, `app/emails/templates/webhook-dead-letter.tsx` + registry, `app/services/announce-webhook-dead-letter.ts`, `app/wiring/shop-announcements.server.ts`
- Tests/helpers: `app/test/webhook-queue.ts` (`captureWebhookQueue`, `failWebhookQueue`), `app/test/webhook-deliveries.ts` (`queuedDelivery` is now `admittedDelivery`), `app/test/notification-payloads.ts`
- Docs/rules: `docs/webhooks.md`, `docs/OPERATIONS.md`, `.claude/rules/{shopify-api-invariants,cloudflare,design-patterns,testing,web-push}.md`, `AGENTS.md`

**No migrations.** The `webhook_deliveries` columns are unchanged; `queued` stays a valid status for rows the old receiver wrote.

## Per app

- If the app has its **own webhook topics**, end each route in `enqueueVerifiedWebhook(authenticated, typedValues?)` and delete any claim/mark-queued call in the route. If a handler needs values from the payload, put them on `intake` and record them in `admitWebhook`, in that order.
- If the app added staff topics, add `webhook_dead_letter` next to them; the settings page picks up the new "System" group without a change.
- Adjust any test that asserted `status: "queued"` after a route call: the route now leaves **no row**; run the message through `consumeWebhook` first.

## Deploy

- Deploy as one unit (the same Worker serves `fetch` and `queue`). Avoid a gradual deployment for this release: an old consumer acknowledges a new message as `missing` because it finds no inbox row. Not verified against a real rollout.
- Messages already on the queue (old shape) are consumed normally. Once the queue has drained, remove the `intake`-optional tolerance and the `queued` status in a later change.
- Rows the old receiver left in `received` or `queued` with no message behind them (the crash window it had) are not found by anything. A one-off look is cheap: `SELECT id, topic, status, received_at FROM webhook_deliveries WHERE status IN ('received','queued') AND received_at < <now minus 1 hour>` on production, run by an operator.

## Verify

```bash
npm install && npm run cf-typegen && npm run verify
```

Then by hand on a deployed environment: send a real `app/uninstalled` (uninstall a dev store) and check the staff notification and the `webhook.process` / `webhook.queue` logs; the Shopify Dev Dashboard delivery metrics should show 2xx under a second.
