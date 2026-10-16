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

