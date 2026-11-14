---
name: add-db-table
description: Add a D1 table or column with its adapter, migration and the shop/redact purge entry. Use when creating or changing anything under app/adapters/db, an adapter or drizzle/.
---

# Add a D1 table

Rules: `.claude/rules/data.md` (shop-scoped, raw SQL with bound values, no query per row, forward-only migrations). Read it first. If a library already has the table (`@firesio/*/d1`), use the library: do not add a second one.

1. **Schema**: a table in `app/adapters/db/schema.ts`. Shop-scoped tables carry `shop` and every index starts with it. Money is an integer minor-unit column plus a currency column.
2. **Migration**: `npm run db:generate`, **read the SQL**, then `npm run db:migrate:local`. Never hand-edit an applied migration; a removed column is two deploys.
3. **Port and adapter**: the port in `app/core/<area>/ports.ts`, the adapter in `app/adapters/d1-<name>.ts` (raw SQL, every value bound, `shop` first). A write that belongs with a portal event goes in the same `db.batch` as `enqueueStatement(...)` (`adapters/d1-shops.ts`, `prepared` from `adapters/d1-batch.ts`). Compose it in `app/wiring/services.ts`.
4. **`shop/redact`**: add `DELETE FROM <table> WHERE <shop column> = ?1` to `SHOP_SCOPED_DELETES` in `app/wiring/webhooks.ts`, and seed a row in your table in `app/wiring/webhooks.test.ts` so a purge that forgets it fails. A table with files also needs a `before` step in `complianceDeps`. A table without a shop column needs a written reason.
5. **Metrics**: a number the portal should see is a metric: one line in `app/core/metrics.ts` and one collector in `core/metrics-snapshot.ts` (and a count in `adapters/d1-metrics.ts`).
6. **Tests** (real local D1, no mocks): the adapter, **a test proving it cannot read another shop's row**. `setupTestDatabase()` at the top of the file.
7. `npm run verify` (a migration breaks tests that never mention it).
