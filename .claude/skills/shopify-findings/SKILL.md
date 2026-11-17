---
name: shopify-findings
description: Look up this project's verified (and still-unverified) findings about Shopify and Cloudflare behaviour before relying on remembered API behaviour. Use when touching webhooks and their queue, compliance/redaction, offline or online tokens and refresh, install/uninstall, billing and subscriptions, the Partner API, API versions, or member identity (ID token, account_owner).
---

# Shopify and Cloudflare findings

The project's log of costly findings is `docs/shopify-api-invariants.md` (about 70 KB; most evidence paths are the earlier app's, see its header for where the code lives now). It is **not loaded automatically**.
Do not read it whole. Find the section, read that section only.

```bash
rg -n '^## ' docs/shopify-api-invariants.md          # section index
rg -n -i '<keyword>' docs/shopify-api-invariants.md   # e.g. refresh, tombstone, HMAC, triggered-at
```

| If you are working on | Read section |
|---|---|
| Webhook HMAC, retries, ordering, compliance topics, token refresh, `authenticate.webhook` 500s | "Webhook delivery, compliance and offline tokens" |
| Queue-first receiver, dead letters, side-effect dedupe | "Queue-first receiver, side effects and dead letters" |
| Unknown-shop webhooks, cron (the uninstall probe is the preset's hourly step now) | "Unknown-shop webhooks and uninstall-probe capacity" |
| `shopify-app-react-router` / `shopify-api` behaviour | "shopify-app-react-router 3.x upgrade" |
| App Store install rules, shop-domain form | "App Store install requirements" |
| Loader / `afterAuth` speed, KV write limits, static asset caching | "Merchant load path" |
| ID token `sub`, online tokens, `account_owner`, `collaborator` | "Who is using the app: members" |
| Seat overage and trimming | "Seat overage: notify, then trim" |
| Development-store detection | "Development store detection" |
| Reinstall race, KV session lookup after uninstall | "Session lookup after a quick uninstall and reinstall" |
| API versions, Partner API version, dependency peer limits, wrangler/workerd | "API versions, dependency peer limits and platform changes" |
| Partner subscription fields (cancel date, billing cycle, trial) | "Settled — do not re-litigate" |

## Rules for using it

- A live docs lookup (`shopify-plugin:*` skills) always wins over this file. If it contradicts the log, say so and fix the log in the same change.
- Rows marked **Unverified** are guesses. Do not build on them as if settled.
- When you learn something expensive (API quirk, protected-data scope, behaviour unlike its docs), add a row with **how and when you verified it**
  and the **design consequence**. Move an unverified item up only with what you observed and the date.
