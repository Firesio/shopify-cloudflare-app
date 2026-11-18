---
name: add-db-table
description: Add a D1 table or column with its migration, its adapter, and check the shop/redact purge covers it. Use when creating or changing anything under app/db, app/adapters, a query of the app's own or drizzle/.
---

# Add a D1 table

Rules: `.claude/rules/data.md` (shop-scoped, bound values, no query per row, forward-only migrations). Read it first. If `@firesio/app` already has the table (`@firesio/app/*/d1`, `@firesio/app/preset/d1`), use that: do not add a second one.

1. **Schema**: a table in `app/db/schema.ts` (`app/firesio.server.ts` hands that module to the preset as `schema`). Shop-scoped tables carry `shop` and every index starts with it. Money is an integer minor-unit column plus a currency column.
2. **Migration**: `npm run db:generate`, **read the SQL**, then `npm run db:migrate:local`. Never hand-edit an applied migration; a removed column is two deploys; a renamed table or column is a rename in the SQL (answer drizzle-kit's "created or renamed?" truthfully), never a drop and a create, with a test that rows written before it survive (`tools/architecture/migration-rows.test.ts`).
3. **Queries**: in an adapter of the feature, `app/adapters/<feature>/`, implementing a port the feature declares in `app/core/<feature>/` (`OrdersRepo`), handed `services.db` (Drizzle over `env.DB`, typed by the `schema` passed to `createFiresio`) and the shop by its wiring (`app/wiring/<feature>.ts`, plugged into `withServices` in `app/firesio.server.ts`); a route then reads it from the bag (`firesio.loader("orders:view", ({ orders }) => orders.list())`) and never imports `~/db` (lint refuses it). Always filtered by `shop`. A write that belongs with a portal event goes in the SAME `db.batch` as the event's outbox statement, built from `services.portal` (the preset exposes `services.shops`, `billing`, `usage`, `portal`, `support`, ... ; the app's own tables are the app's to query).
4. **`shop/redact`**: nothing to list: the preset erases every table of `app/db/schema.ts` that has a column named `shop`. A table keyed by another column goes in `purge: { shopScoped: [{ table, column }] }`; one that must survive a redaction goes in `purge.keep`, with the legal reason in a comment; a table with files in R2 needs the app's own step (the preset erases only its own). A table without a shop column needs a written reason.
5. **Metrics**: a number the portal should see is a metric: a catalogue entry and a collector in `createFiresio({ metrics: { catalogue, collectors } })`.
6. **Tests** (real local D1, no mocks; the adapter's test is `*.workerd.test.ts` beside it): the query, **a test proving it cannot read another shop's row**, and one that a purge removes the table's rows. `setupTestDatabase()` at the top of the file.
7. `npm run verify` (a migration breaks tests that never mention it).
