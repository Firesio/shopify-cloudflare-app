# Entitlements Template

This subsystem is intentionally app-neutral. Configure a catalogue, then use the service gates from
feature code. D1 is authoritative; KV is only an advisory snapshot cache.

## Configure

Define each feature explicitly as a `capability`, `capacity`, or `quota` (`lifetime`, `calendar_month`,
or `billing_period`). Plan grants provide `enabled`, `disabled`, `unlimited`, or a non-negative integer
`limit`.

## Examples

```ts
const reports = createPlanGate({ entitlements, key: "reports.export" });
const staff = createCapacityGate({ entitlements, key: "staff.max", allocationId: staffId });
const documents = createQuotaGate({ entitlements, key: "documents.monthly", amount: 1 });
```

Capacity is reusable rather than lifetime consumption: allocate a stable resource ID, deallocate it when
the resource is removed or disabled, and the slot can be allocated again forever. Quotas reserve, then
commit the measured amount; release abandoned reservations. Billing-period quotas require subscription
bounds and monthly periods use UTC `YYYY-MM` keys.

## Project handoff checklist

- Define the catalogue with `defineCatalogue` (typed keys) and test it with `catalogueProblems`.
- Add feature keys and explicit definitions to the catalogue.
- Add plan grants and keep display names/prices separate.
- Use stable allocation IDs and idempotency operation IDs.
- Measure usage in safe integer units.
- The `entitlement_reconcile` sweep already runs on every cron tick; pass `decide` if releasing an old held item is wrong for your app.
- Decide what a shop with no billing row, and a lapsed subscription, may do, and change `subscriptionSnapshot` (not the policy) to say it.
- If shops already own the resource a capacity counts, `adopt` it once.
- Give snapshots a `timeZone` if a monthly quota should reset at the merchant's midnight.
- Invalidate snapshots after subscription projection changes and uninstall.
- Deploy the entitlement migration with the rest of the D1 schema.

Keep business tables, authorization rules, provider adapters, merchant paywall UI, and app-specific AI
outside this template. Internal administrative AI is intentionally ungated.
