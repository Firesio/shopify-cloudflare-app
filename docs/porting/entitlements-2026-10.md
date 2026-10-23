# Entitlements: typed keys, shop-local months, usage, adopt, batch reads, scheduled reconciler (port guide)

Everything changed on the template between `2f4edab` (last commit before) and `a091fc4`. Use this to bring the same work into an app
created from the template. The behaviour and the risky changes are in `docs/UPGRADING.md` (2026-10-23); how to use each addition is in
`docs/entitlements.md`.

| Commit | What |
|---|---|
| `c04bd44` | A cron sweep settles quota and capacity a crashed run left `held` (the reconciler was built but never scheduled) |
| `a091fc4` | Typed keys, shop-local months, `usage`, `adopt`, `resolveMany` / `currentForShops`, ladder helpers, free-shop admission, snapshot builder |

```
A  Scheduled reconciler   (1 migration: two partial indexes)          c04bd44
B  Entitlement additions  (no migration; ports gain optional members) a091fc4
```

A and B are independent. Port A first if the app has a cron; each leaves the app green.

## How to apply

```bash
git remote add template <template-repo-url> && git fetch template
# by path, from the range; -3 merges with your own changes to the same files
git diff 2f4edab a091fc4 -- <paths below> | git apply --3way
```

After each: `npm install && npm run verify`, then `npx vitest run --sequence.shuffle.files` (KV and in-memory state are not reset between files).
Never run `migrate.mjs --remote` or `wrangler deploy` to "test".

## A. Scheduled reconciler (`c04bd44`)

**Why.** `docs/entitlements.md` said a scheduled reconciler must settle held rows, but nothing scheduled it.

**Files.** New: `app/domain/entitlement-held.ts` (+ test), `app/models/entitlement-held-sweep.server.ts`, `app/services/entitlement-held-sweep.ts`
(+ test), `app/wiring/entitlement-held-sweep.server.ts` (+ test), `app/models/entitlements-held-sweep.test.ts`, `drizzle/0032_*.sql` + snapshot.
Changed: `app/db/schema/entitlements.ts` (+ test: the two partial indexes), `app/ports/scheduled.ts` (new required `entitlementReconcile`),
`app/services/scheduled.server.ts` (+ test), `app/wiring/webhooks.server.ts` and `app/wiring.server.ts` (build and export the sweep),
`workers/app.test.ts` and `app/services/probe-installed-shops.integration.test.ts` (the new dependency and sweep name).

**Per app.** Pass `decide` / `maxAgeMs` where the sweep is built if releasing an old held item is wrong for the app. No `wrangler.jsonc` change:
the sweep rides the existing cron ticks.

## B. Entitlement additions (`a091fc4`)

**Files (copy as is, then adapt wiring).**
- Domain: `app/domain/entitlement-policy.ts` (`defineCatalogue`, generic `EntitlementCatalogue`, `ladder`, `timeZone`), `entitlement-ladder.ts`,
  `zone-day.ts`, `subscription-snapshot.ts`, and their tests (`entitlement-ladder`, `entitlement-keys`, `entitlement-policy-zone`, `zone-day`,
  `subscription-snapshot`).
- Ports: `app/ports/entitlements.ts` (`UsageResult`, `AdoptResult`, `QuotaUsage`, `CapacityUsage`, optional `readUsage` / `readAllocations` /
  `adopt` / `currentForShops`), `app/ports/plan-grants.ts` (`findActiveGrants`).
- Models: `app/models/entitlements.server.ts` (`readUsage`, `readAllocations`, `adopt`, the revision-0 guard, `NONE` for reserve, `EntitlementRepoOptions.admittingStatuses`),
  `plan-grants.server.ts` (`findActiveGrants`), `shops.server.ts` (`getMany`), `shop-subscriptions.server.ts` (ordering). Tests:
  `entitlements-no-projection`, `entitlements-admitting-statuses`, `entitlements-usage-adopt`, `plan-grants-batch`, `shops-batch`, `shop-subscriptions-batch`.
- Service: `app/services/entitlements.server.ts` (`usage`, `adopt`, `resolveMany`, generic `EntitlementService<K>`), test `entitlements-extensions.server.test.ts`;
  `app/services/entitlements.server.test.ts` only declares one catalogue as `EntitlementCatalogue`.
- Adapters and billing: `app/adapters/entitlement-cache.server.ts` (+ `entitlement-cache-timezone.test.ts`), `app/billing/gates.ts`.
- Wiring: `app/wiring/billing.server.ts` (`subscriptionsPort` with `currentForShops` and `timeZone`; the readers and `adopt` on the ports),
  `app/wiring/repositories.server.ts` (`getMany` on `ShopsPort`), test `app/wiring/entitlement-batch.test.ts` (the end-to-end reference).

**Per app.** Replace `subscriptionSnapshot` if the app's rules differ from the template's fail-closed reading (lapsed subscription as the free
plan, a shop with no billing row as the free plan at revision 0, a scheduled cancellation without a date kept active). Define the catalogue with
`defineCatalogue` and test it with `catalogueProblems`. Give the snapshot a `timeZone` when a monthly quota should reset at the merchant's midnight.
