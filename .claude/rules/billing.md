---
paths:
  - "app/billing/**"
  - "app/routes/app/billing*"
  - "app/components/billing/**"
  - "app/models/shop-subscriptions*"
---

# Billing: what the merchant is told about their plan

Entitlement logic and the plan catalogue: `docs/entitlements.md` and the `add-entitlement` skill. Facts about Shopify subscriptions (statuses, dates, cancel and frozen semantics): `docs/shopify-api-invariants.md`. Money: `.claude/rules/money.md`. Plan names, prices and copy are template placeholders (`CLAUDE.md`).

The page tells the truth about three things, each decided by a pure function with exhaustive tests, never inside the route:

- **Which card says "Current plan"**: `currentPlanHandleFor` (`app/billing/current-plan.ts`) follows the plan the shop's ENTITLEMENTS are on (`resolveEffectivePlan`). A pending, frozen, cancelled or inactive subscription is Free; a promotional grant that outranks the subscription wins; a paid subscription whose Shopify handle is not in the catalogue selects NO card. Never guess a plan from an unknown handle, and never show a plan name for it that is not the merchant's.
- **What the status line says**: `statusLine` and `planActionKind` (`app/billing/billing-presentation.ts`) are `Record<SubscriptionPhase, …>`: active, cancelling, frozen, pending, cancelled, inactive. A new phase fails the build until it has a sentence and a button label. Never say "Renews {date}" for a phase that does not renew, and never fall back to `now` when a date is unknown: show no line.
- **Dates and money**: the Partner cancel date is date-only (UTC calendar date; format with the `UTC` zone, not the shop's); trial and renewal use the shop's zone through `useTimeZone()`. The subscription is shown in ITS OWN currency; never compare or mix it with the catalogue's.

Loading follows `polaris-app-home.md` ("Loading"): the plan cards are static and render at once; only what depends on the subscription (name, status, price line, button, the "Current plan" badge) is a same-shape skeleton.
