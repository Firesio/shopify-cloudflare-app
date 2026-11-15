---
paths:
  - "app/routes/app/**"
  - "app/firesio.server.ts"
  - "app/db/**"
---

# Merchant speed

The merchant's first paint must not wait for anything the page does not need. Full reasoning, the measuring table and
the audit that produced these rules: `docs/merchant-speed.md`. Read it before changing a loader or a list query.

## Never

- **Await a side effect on the merchant's request at install or sign-in.** `afterAuth` is the preset's (`firesio.shopify`): it awaits the
  redaction fence and the install record and hands the rest to `waitUntil`. The app has no `afterAuth` of its own and adds nothing in
  front of it; work that must happen at install is a preset change, not an `await` in a route.
- **Call Shopify (Admin, Partner) with no timeout, or inside a loader's critical path** when the page can render without
  it. Cache the answer (KV, shop-scoped, with a TTL) or store it on the row.
- **Write KV on a read path.** A KV key takes about one write per second; concurrent writers to one key are a bug.
- **Read the same thing twice in a request** when it is a pure read: read it once in the loader and pass it down. Module-scope
  caches are banned (cross-tenant leak; an isolate serves many shops).
- **Add a query that scans a shop's history** on a page view: no list, count, sum or search without an index that
  matches `WHERE` + `ORDER BY` (tenant first) or a counter/cache. No `LIKE '%x%'` over a large table, no `SELECT *`
  of JSON columns for a count, no unpaginated list, no `OFFSET` deep paging. Test with `EXPLAIN QUERY PLAN` on 50 000
  rows for one shop.
- **Poll without a bound.** Time or count ceiling, backoff, pause on `document.hidden`.
- **Put `immutable` on a stable URL**, or remove `/assets/*` from `public/_headers` (`app/core/public-headers.test.ts` pins it).
- **Depend on a function or class name** (`constructor.name`): the Worker bundle is minified (`app/components/thrown-response.ts` exists for that reason).

## Always

- Put what a page can paint without behind a streamed region (return the promise from the loader, `<Suspense>` and `<Await>`) with a
  same-shape fallback (`.claude/rules/polaris-app-home.md`, "Loading"): the template ships no helper for it.
- Combine independent D1 reads with `db.batch`; D1 is single-threaded, so `Promise.all` saves only network time.
- Keep a streamed region under the 5 s `streamTimeout` (`app/entry.server.tsx`); a large shop must not turn it into a failure banner.
- State the numbers when claiming a speed-up: queries per page before/after, rows read, bundle size.
