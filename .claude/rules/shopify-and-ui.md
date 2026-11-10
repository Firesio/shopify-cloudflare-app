---
paths:
  - "shopify.app*.toml"
  - "extensions/**"
  - "**/*.graphql"
  - "app/shopify*"
  - "app/routes/app/**"
  - "app/routes/webhooks/**"
  - "app/adapters/shopify*"
---

# Shopify APIs and admin UI

Shopify's APIs and component libraries change faster than any model's training data; a plausible wrong answer costs a failed app review or a broken install. Inventing a component prop, a mutation field, a scope or a config key and presenting it as correct is fabrication (No Cheating), even when it typechecks.

## Never write Shopify code from memory

Before any Shopify-touching code, invoke the matching `shopify-plugin:*` skill:

| What you're touching | Skill |
|---|---|
| Embedded admin UI (App Home, Polaris) | `shopify-polaris-app-home` |
| Admin UI extensions | `shopify-polaris-admin-extensions` |
| Admin GraphQL queries and mutations | `shopify-admin` |
| CLI, `shopify.app.toml`, store auth | `shopify-use-shopify-cli` |
| Metafields / metaobjects | `shopify-custom-data` |
| Functions (discounts, validation) | `shopify-functions` |
| Analytics numbers | `shopify-shopifyql` |
| App Store submission readiness | `shopify-app-store-review` |
| Anything else Shopify, or unsure | `shopify-dev` |

Scopes, webhook topics, protected-data requirements, billing, rate limits and API-version behaviour all go through a lookup, never recall.

**The loop is not optional**: `scripts/search_docs.mjs "<query>"` → write against what it returned → `scripts/validate.mjs --code '...'` → on failure search the error, fix, re-validate (at most 3 retries). Never return unvalidated code. `OPT_OUT_INSTRUMENTATION=true` only stops telemetry; never remove it or skip validation because of it. If a lookup contradicts this repo's docs or your memory, the lookup wins: say so out loud.

**Record what you verify** in `docs/shopify-api-invariants.md` (see the `shopify-findings` skill): what you observed and when, and the design consequence. Label anything unverified as unverified.

## Admin UI is Polaris, and every element is looked up

All merchant-facing admin UI (embedded `/app/**` and extensions) is Polaris web components plus App Bridge. No Tailwind, no hand-rolled CSS, no styled `<div>`s imitating Polaris. Public pages are a different surface (SCSS, `.claude/rules/styling.md`) with no Polaris and no App Bridge.

Which elements exist depends on the installed `@shopify/polaris-types`; if the JSX type is missing the element is not available. Look up props, slots and allowed children first: the procedure is `.claude/rules/polaris-app-home.md`. A component that renders is not a component used correctly. Polaris cannot be unit-tested: test the server side and say the UI was verified by hand.

## Red flags: stop and look it up

"I think the field is called…" · "it should accept…" · a GraphQL mutation written without searching its current shape · a scope added because it sounds right · custom CSS on an admin surface · Polaris code `validate.mjs` never saw.
