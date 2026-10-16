# Porting: merchant speed (2026-10-16)

For an app built on this template. Background and rules: [`docs/merchant-speed.md`](../merchant-speed.md). Same
approach as the webhook port: cherry-pick, then re-check each seam against the app's own code, because every app
differs where it matters (its `afterAuth`, its entitlement wiring, its home loader).

## What changed in the template

| Change | Files |
|---|---|
| `requestMemo`, `forgetRequestMemo`, `runAfterResponse`; `runWithRequestContext(env, fn, ctx?)`; `workers/app.ts` passes `ctx` to `fetch` | `app/request-context.server.ts`, `workers/app.ts` |
| `afterAuth` awaits the fence and `recordInstall`; identity, announce, Partner refresh run after the response | `app/shopify.server.ts` |
| Partner adapter: `timeoutMs` (default 10 s), `AbortSignal.timeout` on every request | `app/adapters/shopify-partner.server.ts` |
| Entitlements: `check` never writes the cache, `preview` fills it; the subscription snapshot is memoised per request and dropped by `invalidateEntitlements` and by `refreshShopSubscription` | `app/services/entitlements.server.ts`, `app/wiring/billing.server.ts`, `app/wiring/entitlement-cache.server.ts` |
| `shops` row read once for identity + time zone | `app/wiring/shop-identity.server.ts` |
| `/assets/*` immutable, day-long cache for stable images | `public/_headers`, `app/public-headers.test.ts` |
| Worker bundle minified (names kept) | `vite.config.ts` |

## Port checklist

1. Cherry-pick, resolve, then **read the app's own `afterAuth`**: anything it awaits besides the fence and
   `recordInstall` (storefront sync, provisioning, a queue send, `reopenAfterReinstall`) is a candidate for
   `runAfterResponse`. Keep inline only what the first page needs to be correct, and say why in a comment.
2. Find every entitlement call site (`grep -rn "\.check(\|planLimits"`): they must share one snapshot per request
   (`requestMemo`) and none may write KV.
3. Check `public/_headers`, `vite.config.ts`, `wrangler.jsonc` `placement`.
4. Run the app's full `npm run verify`, then `npx react-router build` and compare the Worker size.
5. For a production app, migrations that add an index land before the worker (`cf:deploy` order); an index on a large
   table is built while D1 keeps serving, but check the table size first.

## What the audit found per app

Counts are structural (read from code or measured against a local SQLite copy), not production timings. "Fixed"
means fixed in that app's repository; the commit is in its history. Anything not listed as fixed is still open.

All six ported the template commit (`161da39`) and then fixed their own findings. Pushed 2026-10-16; none was exercised
against production traffic by the author, so the first week of `wallTimeMs`/`rows_read` after each deploy is the real test.

| App | Migration | What was fixed beyond the port | Open items (also in that app's `docs/merchant-speed.md`) |
|---|---|---|---|
| vip-early-access (prod) | none | one snapshot for the three plan limits; launch lists use aggregate reads instead of hydrating 100 launches; tier counts cached 60 s with invalidation; tier currency streams; launch order summary cached 60 s | launch editor still re-runs ~10 reads per 3 s tick; `findSessionsByShop` fetches every session |
| trade-in (prod) | `0076` two indexes on `trade_in_requests` | afterAuth skips provisioning work when completed; setup read is one round trip with SQL count; Home streams and batches; status counts cached 60 s; catalog tree/public projection no longer O(n²); stored zone/contact instead of Shopify calls; bounded polling | messages/timeline unbounded; request search `LIKE '%q%'`; i18n JSON in `entry.client`; `recordInstall` rewrites install columns on every mint (they are the ordering key for late uninstalls, left as is) |
| warranty | `0026` columns on `shops`, indexes on `order_lines`, `warranties`, `shipping_protections`, `claims` | Home metrics/attention indexed and streamed; shop country stored (no live Admin call on Shipping); claims tabs read 80 rows instead of 28,804; plan filter 30,011 rows to 22; narrower catalog reads | catalog counts still computed in the Worker; policy filter and the Expired/Void/Awaiting tabs unindexed; two KV session puts stay sequential on purpose |
| repair-service-ops | none | Home 179 to 42 statements (117 to 36 waits); presets on demand; shared report context; unpaid summary cached 60 s with invalidation at its three writers; queue badges stream; catalogue capped | queue sorts by customer/status/due and `LIKE '%x%'` search; ticket cohorts/step transitions still per row (cap 20,000); calendar, new ticket, team, catalogue, requests, invoices do not stream |
| team-up-new | `0035` index `entries (shop, created_at)` | dashboard cached 60 s + indexed; storefront sync has one owner; one authentication per request; orders list totals from the page query; order sheet streams and caps at 1,000 rows | dashboard rollup (per-order totals, daily counters); order search; orders list and settings block on the loader |
| intent-cart | none | Home awaited part 52 to 15 statements (21 to 3 waits); entitlements memoised; decision-log filtered search bounded (10,002 rows instead of 300,001 on a no-match filter, no index because of write cost); bounded polling on a light route; `entry.client` 136.5 to 80.5 kB gz | add-ons-sold aggregate; first-visit hydration waits for one cached locale chunk (unmeasured in a real iframe) |

Facts that held across the apps: the template's `billing.memo.test.ts` identity check needs adapting where the app
returns a shared UNKNOWN snapshot; a bound JS number in D1 is a REAL, so `x / ?` folds nothing; a test that grants a plan
directly in D1 and then checks it in the same request must call `invalidateEntitlements`.
