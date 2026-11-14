---
paths:
  - "app/adapters/**/*.ts"
  - "drizzle/**"
  - "drizzle.config.ts"
---

# Data access

D1 is a network hop per query and the app is multi-tenant. Both are binding.

## Whose tables

- **The app's own** (`app/adapters/db/schema.ts`): `shops`, `shop_subscriptions`, `shop_plan_grants`, `notification_preferences`.
- **The libraries'** (`@firesio/*/d1`): the webhook inbox and tombstones, plan usage, support, members, content edits, push devices, AI, the portal outbox. Their schemas are listed in `drizzle.config.ts`; `npm run db:generate` sees all of them and writes ONE migration history in `./drizzle`. The app owns the migrations; a library never migrates anything.
- Adding a table: add it to the schema file (or the library's schema to `drizzle.config.ts`), `npm run db:generate`, **read the SQL** (Drizzle cannot express a CHECK or WITHOUT ROWID: where the library publishes `...TableSql()`, the migration must match it, as `plan_usage` does), run the whole suite.

## Shop-scoped, always

Every app table carries `shop` (or `scope`, `subject`, `account_id` where a library names it). Every query includes it; every adapter function takes it as its **first parameter**. An id from a form or URL is attacker-controlled. A query that can read or write another shop's row is a **security defect**, and a test proving it cannot is part of the feature (`app/adapters/*.test.ts`). `redacted_shops` is the one table without a shop: a hash and a time, nothing that identifies the shop. `shop/redact` deletes every shop-keyed table in ONE batch with the tombstone and the `account.redacted` outbox row (`wiring/webhooks.ts`, `SHOP_SCOPED_DELETES`): a new shop-keyed table goes in that list, and the test in `wiring/webhooks.test.ts` seeds a row in it.

## Raw SQL, bound values (a decision, and why)

The adapters use `env.DB.prepare(sql).bind(...)`, the way the libraries' D1 adapters do. Why not Drizzle queries: a write that belongs with a portal event must sit in the SAME `D1.batch` as the library's `enqueueStatement`, which is a prepared statement; Drizzle batches cannot hold one. Rules that keep it safe: every value is bound (`?1`), never interpolated; a table or column name from code is a literal in the file; no query inside a loop over fetched rows (batch it); every guard and its write are ONE statement or ONE batch (the `ON CONFLICT ... DO UPDATE ... WHERE` of the subscription store), never a read followed by a write that assumes the read still holds.

## Migrations are forward-only

Once applied to production, never edit, rename or renumber a migration: a new one fixes a bad one. The template's `0000_baseline` is edited in place only until the first app deploys it (it is a new baseline: an app built on an earlier template migrates feature by feature, roadmap step 14). Adding a column is safe; removing one is two deploys (stop reading, then drop). A change under `drizzle/` or an adapter runs the **full** suite.

## Money

Integer minor units plus a currency, always together: `@firesio/money`. No `REAL` column for an amount.

## Failure boundaries

Independent panels fail independently with a sensible empty value **and a logged event**, never `catch {}`. **Degrade decoration, never correctness**: a badge may fall back to empty; an amount, an entitlement or a status the merchant acts on fails loudly.
