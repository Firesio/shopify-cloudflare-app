# Keeping the embedded admin fast

How the merchant side (`/app/**`) is kept fast, the rules that keep it that way, and how to measure it. The incident
list at the bottom is real: every item was found in the template or in the apps built on it by the 2026-10-16 audit.
Verified Shopify and Cloudflare facts are in [`shopify-api-invariants.md`](../.claude/rules/shopify-api-invariants.md);
the rule file agents load is [`merchant-speed.md`](../.claude/rules/merchant-speed.md).

## What the merchant waits for

A document load of `/app/...` runs, in this order:

1. Cloudflare serves the HTML shell from the Worker (cold isolate: the whole server bundle is parsed first).
2. `authenticate.admin` verifies the session token. Once an hour per shop the stored access token expires and the
   library **mints a new one (token exchange) and awaits `afterAuth`**: that request pays for everything `afterAuth`
   awaits.
3. The layout loader and the page loader run in parallel. The page waits for the slower one.
4. React renders; regions wrapped in `settle()` / `<Deferred>` stream in after the frame.
5. The browser fetches about 20 JavaScript chunks (`/assets/*`) and App Bridge/Polaris from Shopify's CDN.

Client-side navigations skip 1, 2 and the layout loader (`shouldRevalidate` on the layout): only the page loader runs.

## Rules

1. **Never await on the response path what the page does not need.** The rule for `afterAuth`: await the redaction
   fence and the `shops` row (`recordInstall`); everything else (identity query, announcement, Partner API refresh)
   goes through `runAfterResponse` (`app/request-context.server.ts`). That helper uses `ctx.waitUntil` when the Worker
   has an execution context and simply awaits where it has none (cron, queue, tests). `waitUntil` has a shared budget
   of about 30 s and is then cancelled, so only decoration and work something else repairs may ride it.
2. **Every outbound call has a timeout.** `ShopifyPartnerAdapter` takes `timeoutMs` (default 10 s, `AbortSignal.timeout`).
   A Shopify Admin or Partner call in a loader needs one too, and a loader should not wait for it unless the page is
   wrong without it.
3. **Read once per request.** A read several call sites repeat in one request goes through `requestMemo(key, make)`
   with a key that carries the shop; every write that makes it stale calls `forgetRequestMemo`. Today:
   the subscription snapshot (`subscriptionsPort().current`, dropped by `invalidateEntitlements` and by a refresh)
   and the `shops` row read by `persistShopIdentity` and `shopTimeZone`. Never memoise in module scope: an isolate is
   shared across shops (`@rules/architecture.md`).
4. **An entitlement check does not write.** `check`, `allocate`, `reserve` read the projection; only `preview` reads
   and fills the KV cache. A KV write per check was never read by anything, and concurrent checks wrote one key
   several times in a request (KV rate-limits writes to one key).
5. **Hashed assets are cached for a year.** `public/_headers` has `/assets/*` with `public, max-age=31536000,
   immutable`. Vite puts a content hash in every filename there, so a deploy changes the URL, and the document (rendered
   by the Worker, never cached by this rule) always points at the current files. Do not add `immutable` to a file whose
   URL never changes (`/internal-sw.js`, an image linked from an email): those get a day plus `stale-while-revalidate`.
   `app/public-headers.test.ts` pins this.
6. **The Worker bundle is minified** (`environments.ssr.build.minify` in `vite.config.ts`, with names kept). It was
   about 6 MB of unminified code parsed by every cold isolate; now about 3.4 MB. Code must not depend on a function or
   class name: Shopify's `boundary.error` compares `error.constructor.name` with `"ErrorResponseImpl"` and a minified
   bundle renames it, which is why `thrownResponseHtml` exists. Read an error by `status`/`code`/`instanceof`.
7. **A loader's cost is the number of sequential D1 waits.** D1 runs one query at a time per database, so
   `Promise.all` saves network time, not database time. Combine reads with `db.batch`, never query in a loop, and put
   anything a page does not need to paint behind `settle()` (it streams after the frame, with a spinner).
8. **Nothing scans a shop's whole history on a page view.** A query behind a list, a count or a dashboard must be
   bounded by an index that matches its `WHERE` and `ORDER BY` (tenant first), or read a counter or a short-lived cache.
   "50 000 rows for one shop" is the test case. Check with `EXPLAIN QUERY PLAN`; a `SCAN` or `USE TEMP B-TREE` over
   the shop's rows is the red flag. Production tables get new indexes by a forward-only migration (`@rules/data.md`).
9. **Polling is bounded.** A revalidation loop has a ceiling (time or count), backs off, and pauses when
   `document.hidden`. An unbounded 3 s loop re-runs the whole loader, with its dozens of queries, for every open tab.
10. **A streamed region that can take longer than `streamTimeout` (5 s in `entry.server.tsx`) is a defect:** it renders
    as a failure to a shop that is merely large.

## Measuring

Do this before and after any change that claims to make the admin faster.

| What | How |
|---|---|
| Real-user numbers (LCP, CLS, INP, p75 over 28 days; Built for Shopify needs LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms) | Dev Dashboard → app → Monitoring. In code, `shopify.webVitals.onReport` |
| Round trips versus compute | Workers Observability: compare `wallTimeMs` with `cpuTimeMs` per route. Wall far above CPU means D1/KV/outbound waits |
| Cold start | `npx wrangler check startup` on the production build, or the "Worker Startup Time" line of `wrangler deploy` |
| Rows read | D1 insights: `rows_read` per query, largest shops first. D1 does not run `ANALYZE` for you: local plans can differ |
| Bundle | `npx react-router build`, then sizes under `build/server/assets` and `build/client/assets` |
| Where D1 lives | `wrangler d1 info`; compare with the Worker's colo. Smart Placement (`placement.mode: "smart"`) and the read-replica Sessions API are options **only after measuring** |

Lighthouse is unreliable for an embedded app (it runs outside the Shopify iframe).

## Findings of the 2026-10-16 audit (what was wrong, and where it was fixed)

| Finding | Fixed in the template | Apps |
|---|---|---|
| Entitlement checks rebuilt the snapshot (3 D1 reads) and wrote KV on every call; a page ran 3 to 12 of them | `requestMemo` on the snapshot, no write on `check` | see [the porting note](porting/merchant-speed-2026-10-16.md) |
| `afterAuth` awaited identity, announce and the Partner API on the merchant's request, once an hour | `runAfterResponse` | |
| Partner API had no timeout | `timeoutMs`, default 10 s | |
| `/assets/*` revalidated on every load | `_headers` rule, pinned by a test | |
| Unminified 6 MB Worker | `environments.ssr.build.minify` | |
| Layout read the `shops` row twice | `requestMemo` in `shop-identity.server.ts` | |

Not done in the template, recorded so nobody assumes otherwise: Smart Placement and D1 read replication (need
measuring), Workers Web Vitals reporting, splitting the staff console out of the merchant Worker (`DashboardCharts`,
about 1 MB, is parsed by every merchant cold start).
