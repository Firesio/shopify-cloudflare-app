# Entitlements

The entitlement subsystem is the reusable boundary between app features and billing. Feature code asks for a stable key and never compares Shopify plan handles.

## Choose the right kind

- **Capability** is on or off. Use `check(shop, "feature.key")` before exposing or running it.
- **Capacity** limits concurrently active resources. Free can allow one active staff member forever: allocate its stable resource ID before activation, then deallocate that ID on deletion/deactivation so the slot is reusable.
- **Quota** consumes units. `lifetime` never resets, `calendar_month` resets at UTC month boundaries, and `billing_period` uses recorded subscription bounds.

Keep definitions and per-plan grants in the catalogue. Do not add app-specific resource tables or flows to the entitlement subsystem.

## Capability

```ts
const decision = await entitlements().check(shop, "reports.export");
if (!decision.allowed) return denied(decision.reason);
```

## Reusable capacity

```ts
const operationId = crypto.randomUUID();
const held = await entitlements().allocate({
  shop,
  key: "staff.max",
  allocationId: staffUserId,
  operationId,
});
if (!held.allowed) return held;

// Create or activate the resource, then confirm the held attempt.
const allocated = await entitlements().confirmAllocation({ shop, key: "staff.max", allocationId: staffUserId, operationId });
if (!allocated.allowed) return allocated;

// If creation fails, release the held attempt; after activation, deallocate it when removed.
await entitlements().deallocate({ shop, key: "staff.max", allocationId: staffUserId, operationId });
```

Always use a stable resource ID. Duplicate allocation/deallocation is idempotent. A released allocation no longer counts, so a one-staff Free limit works indefinitely rather than being consumed forever.

## Consumable quota

```ts
const reservation = await entitlements().reserve({
  shop,
  key: "documents.monthly",
  operationId: requestId,
  amount: 1,
});
if (!reservation.allowed) return reservation;

try {
  await performWork();
  await entitlements().commit({ shop, operationId: requestId, actualAmount: 1 });
} catch (error) {
  await entitlements().release({ shop, operationId: requestId });
  throw error;
}
```

Use a caller-supplied idempotency key that is stable across retries. Reserve before side effects, commit after success, and release on failure.

## Crash reconciliation

A crash can leave quota reservations or capacity allocations in `held`. They never expire silently, so a sweep settles them:
`entitlement_reconcile` runs on **every cron tick** (before the uninstall probe, `app/services/scheduled.server.ts`).

- By default it **releases** a held item older than `HELD_MAX_AGE_MS` (30 minutes, `app/domain/entitlement-held.ts`): a normal caller settles
  within one request or one queue retry, so anything held that long belongs to a run that died. Newer items are left alone.
- It settles at most `HELD_SWEEP_BATCH` (200) of the **oldest** held items across all shops per tick, grouped by shop, and logs `backlog: 1`
  when the batch came back full. Each settlement is the same guarded, shop-scoped transition a caller uses (`reconcileHeld` over
  `applyReconciliation`), so a replay or a race with a late caller changes nothing twice. A failing shop is logged
  (`entitlements.held_sweep_shop_failed`) and does not stop the others.
- Two partial indexes (`*_held_idx`, migration `0032`) keep the sweep from reading the tables' whole history: both keep every settled row forever.
- **An app that can tell better passes its own policy** where `scheduledDependencies` builds the sweep (`app/wiring/webhooks.server.ts`):
  `entitlementHeldSweep({ decide, maxAgeMs, limit })`, `decide: (item) => "commit" | "release" | "confirm" | "ignore" | { action: "commit"; actualAmount? }`. Use it when a
  held allocation's resource was in fact created (confirm it) rather than losing its slot. An `ignore`d item is listed again next tick, so a
  policy that ignores more than one batch of the oldest items starves newer ones: ignore sparingly.

## Cache and invalidation

KV is advisory and only accelerates display checks. Quota reservations and capacity allocations always use authoritative D1 subscription state. Invalidate `entitlements:v1:${shop}` after every successful subscription projection write, duplicate repair, uninstall, and tenant purge. Malformed, stale, or unavailable KV entries are cache misses.

## A typed catalogue

Define the catalogue with `defineCatalogue`; its keys then type every call:

```ts
export const CATALOGUE = defineCatalogue({
  version: 1,
  freePlan: "free",
  ladder: ["free", "pro"],            // cheapest first: what "the first plan that grants X" scans
  features: { "reports.export": { kind: "capability" }, "staff.max": { kind: "capacity" } },
  plans: {
    free: { "reports.export": { kind: "disabled" }, "staff.max": { kind: "limit", maximum: 1 } },
    pro: { "reports.export": { kind: "enabled" }, "staff.max": { kind: "unlimited" } },
  },
});
```

A plan that leaves a feature without a grant, and a call such as `check(shop, "reports.exprot")`, are **compile errors**. A plain
`EntitlementCatalogue` (keys are any string) still works everywhere, and so does an inline literal in a test. Note that an inline literal
now types the service by ITS keys: a test that probes a key the catalogue does not define declares the catalogue as `EntitlementCatalogue`.
Run `catalogueProblems(CATALOGUE)` in your own catalogue test: it also catches what types cannot (a `limit` on a capability, a negative
limit, a ladder that names a missing plan, a `freePlan` that is not a plan).

## Quota windows and time zones

`calendar_month` resets at the **UTC** month boundary unless the subscription snapshot names a `timeZone` (an IANA zone, usually the
shop's): then the month is that zone's own, keyed by that zone's `YYYY-MM`, and ends at the zone's next midnight-of-the-1st (daylight saving
included, `app/domain/zone-day.ts`). A zone the runtime does not know fails closed (`invalid_usage_window`). `lifetime` and
`billing_period` ignore the zone. If a shop's zone changes mid-month the key stays `YYYY-MM`, so its usage carries on.

## Reading usage without reserving

```ts
const usage = await entitlements().usage(shop, "documents.monthly");
// { allowed: true, kind: "quota", period, window, used, held, maximum?, remaining? }   remaining is absent when unlimited
// { allowed: true, kind: "capacity", used, held, maximum?, remaining? }
```

`used` is what was committed (or allocated), `held` what an operation in flight holds; `remaining` never goes below zero. It writes nothing,
not even the cache. The ports must provide `usage.readUsage` / `capacity.readAllocations` (a missing one throws: that is a wiring defect).

## Adopting resources that already exist

When a key starts being counted for shops that already have the resource, book what exists instead of refusing the shop its own data:

```ts
await entitlements().adopt({ shop, key: "staff.max", allocationId: staffUserId, operationId: `adopt:staff.max:${staffUserId}` });
```

`adopt` records the slot as `allocated` **without** checking the plan's maximum or the subscription's state: it books a fact and grants
nothing. That is also why a plan change never evicts anything: after a downgrade the slots stay counted and only a new `allocate`
meets the lower maximum. It is idempotent per operation and per resource (a second call, or the same resource under another operation, adds no
slot), refuses an operation id used for a different resource, and promotes a held attempt of the same resource.

## Many shops, many keys

For a sweep (or a page that asks many things at once) `resolveMany(shops, keys)` returns the answer of `check` for every pair from **one**
read: `SubscriptionPort.currentForShops` when the port has it, else one `current` per shop. A shop the port has no answer for, or a snapshot
older than `maxSnapshotAgeMs`, is `subscription_unavailable`: a batch never refreshes (that would be one Partner call per shop).

## Which plan unlocks it, and what a move changes

Pure helpers over the catalogue (`app/domain/entitlement-ladder.ts`), for upgrade prompts and downgrade notices:

- `firstPlanGranting(catalogue, key)`: the first plan of the ladder that grants a capability, or any non-zero allowance.
- `firstPlanWithRoom(catalogue, key, n)`: the first plan whose capacity or quota covers `n`.
- `grantsDiff(catalogue, from, to)`: every key a move changes, `gained | lost | increased | decreased`, unchanged keys left out (null for an unknown plan).

## Where the snapshot comes from

`subscriptionSnapshot` (`app/domain/subscription-snapshot.ts`) builds the snapshot from the facts the app holds, and the template's reading
**fails closed**: a shop that is not installed, or whose billing was never observed, is `UNKNOWN` and is granted nothing, not even the free
plan; `FROZEN`, `CANCELED`, `PENDING` and `UNKNOWN` subscriptions are denied (`inactive_subscription`), and `CANCELLATION_SCHEDULED` counts
only before its date. Those rules are the policy's and its tests pin them.

An app that wants different semantics changes **this one function**, not the policy. Typical changes: read a lapsed subscription as the free
plan (map it to `status: "NONE"`), read a shop with no billing row as the free plan at `revision: 0`, or keep a scheduled cancellation without a
date active. The model supports the second: a shop that has no `shop_subscriptions` row can allocate and reserve **at revision 0** (and only
then; any other revision, or revision 0 once a row exists, is a stale snapshot and is refused). `NONE` is an admitting state for both `allocate`
and `reserve`.

The write also re-checks the STORED row: `allocate` and `reserve` are admitted only while `shop_subscriptions.status` is `NONE`, `ACTIVE` or
`CANCELLATION_SCHEDULED` and its revision is the snapshot's. An app that reads a lapsed subscription as the free plan must list those stored
states too, or such a shop is refused a slot or a quota the policy just granted it:
`new EntitlementRepo(clock, { admittingStatuses: ["NONE", "ACTIVE", "CANCELLATION_SCHEDULED", "FROZEN", "CANCELED", "PENDING", "UNKNOWN"] })`.

## Internal AI

The template's current AI is an internal admin/staff tool and is intentionally not entitlement-gated. A future merchant-facing AI flow should use quota reserve/commit/release exactly like any other consumable operation.
