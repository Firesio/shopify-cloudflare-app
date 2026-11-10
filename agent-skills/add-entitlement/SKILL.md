---
name: add-entitlement
description: Gate a feature, capacity or quota by plan, or change plans and prices: entitlement catalogue, plan definitions, checks, usage, translations. Use when something must depend on the merchant's plan.
---

# Add or change an entitlement or plan

Source of truth: `docs/entitlements.md` (choose the kind, usage, crash reconciliation, cache, catalogue). Billing facts from Shopify: `docs/shopify-api-invariants.md` (see the `shopify-findings` skill). Look up Managed Pricing with the `shopify-plugin:*` skills before touching plan identity.

1. **Pick the kind** (`docs/entitlements.md`, "Choose the right kind"): `capability` (on/off), `capacity` (a count held, like `members.max`) or `quota` (consumed per window, like `ai.monthly_tokens`).
2. **Declare it**: the feature in `ENTITLEMENT_CATALOGUE` (`app/billing/entitlement-catalogue.ts`), its key in `EntitlementKey` and each plan's grant in `app/billing/plans.ts`. A plan without a grant for a key is a compile error; run `catalogueProblems` in the catalogue test.
3. **Plans**: the handle is the Shopify Managed Pricing handle and is the plan identity. Price is `Money` (integer minor units + currency, `.claude/rules/money.md`). Shown names and features are translated keys in `common.json` for every language. Placeholders (`TODO:`) must be replaced, never copied.
4. **Check at the seam, not by plan name**: `check(shop, "<key>")` through the entitlement service; never compare a plan handle in feature code. A refusal or unreadable answer means "not allowed", except where a rule says otherwise (seats: `.claude/rules/members.md`).
5. **Quota**: `reserve` before the side effect with a caller-supplied `operationId` that is stable across retries, `commit` after success, `release` on failure (`docs/entitlements.md`, "Consumable quota" and "Crash reconciliation"). Never write usage by hand. A check never writes KV on a read path (`.claude/rules/merchant-speed.md`).
6. **Plan changes** reach D1 from a webhook, history or refresh. A feature that must react to one hooks into `afterPlanChange` (`app/wiring/member-seat-overage.server.ts` is the example, bound in `app/wiring/repositories.server.ts`).
7. **Tests**: each plan's grant, boundary values (at/over the limit), the refusal path, and money formatting.
8. `npm run check:placeholders` must still pass before any production deploy.
