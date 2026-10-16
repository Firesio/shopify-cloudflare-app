---
description: Keeping the embedded admin (/app/**) fast — what a loader, afterAuth, an entitlement check and a list query may and may not do on the merchant's request. Apply when touching app/routes/app/**, app/shopify.server.ts, app/wiring/**, app/services/entitlements*, public/_headers, vite.config.ts or any D1 query behind a page.
globs:
  - "app/routes/app/**"
  - "app/shopify.server.ts"
  - "app/wiring/**"
  - "app/request-context.server.ts"
  - "app/services/entitlements*"
  - "app/models/**"
  - "public/_headers"
  - "vite.config.ts"
alwaysApply: false
---
# Merchant speed

The merchant's first paint must not wait for anything the page does not need. Full reasoning, the measuring table and
the audit that produced these rules: `docs/merchant-speed.md`. Read it before changing a loader, `afterAuth`, the
entitlement wiring or a list query.

## Never

- **Await a side effect in `afterAuth`.** It runs on the merchant's request once an hour per shop. Await the redaction
  fence and `recordInstall`, nothing else; the rest goes through `runAfterResponse`.
- **Call Shopify (Admin, Partner) with no timeout, or inside a loader's critical path** when the page can render without
  it. Cache the answer (KV, shop-scoped, with a TTL) or store it on the row.
- **Write KV on a read path.** `EntitlementService.check` must not touch the cache; a KV key takes about one write per
  second. Concurrent writers to one key are a bug.
- **Read the same thing twice in a request** when it is a pure read: `requestMemo` with a shop-carrying key, and
  `forgetRequestMemo` at every write that changes it. Module-scope caches are banned (cross-tenant leak).
- **Add a query that scans a shop's history** on a page view: no list, count, sum or search without an index that
  matches `WHERE` + `ORDER BY` (tenant first) or a counter/cache. No `LIKE '%x%'` over a large table, no `SELECT *`
  of JSON columns for a count, no unpaginated list, no `OFFSET` deep paging. Test with `EXPLAIN QUERY PLAN` on 50 000
  rows for one shop.
- **Poll without a bound.** Time or count ceiling, backoff, pause on `document.hidden`.
- **Put `immutable` on a stable URL**, or remove `/assets/*` from `public/_headers`.
- **Depend on a function or class name** (`constructor.name`): the Worker bundle is minified.

## Always

- Put what a page can paint without behind `settle()` / `<Deferred>` with a spinner (Polaris has no skeleton).
- Combine independent D1 reads with `db.batch`; D1 is single-threaded, so `Promise.all` saves only network time.
- Keep a streamed region under the 5 s `streamTimeout`; a large shop must not turn it into a failure banner.
- State the numbers when claiming a speed-up: queries per page before/after, rows read, bundle size.
