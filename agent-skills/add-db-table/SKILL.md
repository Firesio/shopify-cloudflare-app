---
name: add-db-table
description: Add a D1 table or column with its model, migration and the tenant-purge inventory. Use when creating or changing anything under app/db/schema, app/models or drizzle/.
---

# Add a D1 table

Rules: `.claude/rules/data.md` (shop-scoped, no N+1, forward-only migrations, Drizzle only) and `.claude/rules/money.md` (money columns). Read them first.

1. **Schema**: a file under `app/db/schema/<domain>.ts` (or a table in the existing domain file) and, for a new file, `export * from "./schema/<domain>"` in `app/db/schema.ts`.
   - Shop-scoped tables carry a `shop` column and every index starts with it. Money is `money("name")` from `~/db/columns`, never `real()`.
   - A table with a lifecycle (`status`) also needs its transitions declared as data (`.claude/rules/core.md`).
2. **Migration**: `npm run db:generate`, then `npm run db:migrate:local`. Never hand-write or edit an applied migration; a removed column is two deploys.
3. **Model**: `app/models/<name>.server.ts`, the only place that queries it. `shop` is the first parameter of every function; select only the columns needed; batch with `inArray`, never a query per row.
4. **Tenant purge** (`shop/redact` must erase everything we hold for a shop). In `app/models/tenant-purge.server.ts`:
   - a table with a `shop` column goes into `PURGED_SHOP_TABLES` **and** gets a `db.delete(...)` in the batch inside `deleteTenantRows`, children before `shops` (foreign keys are enforced on D1).
     `assertTenantPurgeCoverage` makes the purge fail, and `app/models/tenant-purge.test.ts` fail, when a shop table is missing; update the expected list in that test.
   - data keyed by something other than `shop` (a `scope` column, a checkpoint `name`) is **invisible to the guard**: add its delete by hand, as `notification_preferences` and `shopify_sync_checkpoints` do.
   - a table with no `shop` column needs a written reason (see `admin_users`, `redacted_shops` in `.claude/rules/core.md`).
   - if it stores files, their R2 keys must be returned by `prepareTenantPurge`.
5. **Tests** (real local D1, no mocks): the model, **a test proving it cannot read another shop's row**, and any hot query's index (`EXPLAIN QUERY PLAN`, see `.claude/rules/merchant-speed.md`).
6. Run the **full** suite: `npm run verify` (a migration breaks tests that never mention it).
