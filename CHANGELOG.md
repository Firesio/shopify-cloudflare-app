# Template changelog

An app takes a newer template by merging its tag (`template-v<version>`, see `template-files.json`: the `template` files come over
unchanged, the `app` files are the app's). Each entry says what to do besides the merge.

## template-v1.0.0 (unreleased)

The template is a thin shell on the `@firesio/*` packages (roadmap step 13). It is a NEW BASELINE: the schema is one migration
(`drizzle/0000_baseline.sql`), and an app built on an earlier template migrates one feature at a time (roadmap step 14), not by
merging this tag.

- Replaced by the libraries: money, billing and plans, notifications, support, members, the text units, AI, Web Push, the Shopify
  webhook inbox and GDPR purge. The staff console, MCP, campaigns and the `api/v1` routes are gone (the portal replaces them).
- New: `workers/admin-api.ts` (the portal's commands), the `PORTAL_EVENTS` producer and the D1 outbox, the portal's blocklist KV binding,
  `shop.installed`, `shop.reinstalled`, `shop.uninstalled`, `subscription.changed`, `account.redacted` and a daily `metrics.snapshot`.
- New: `eslint.boundaries.js` (the layers), size caps, no `as`, no `any`, no `Date.now` or `crypto.randomUUID` outside `app/wiring`,
  a verify workflow, `npm run new-app`, `/healthz`, a test that compares the top-level and production bindings.
- Rate limits now fail closed (a missing or failing binding denies), as docs/architecture.md section 6.4 says.
