---
paths:
  - "app/db/**/*.ts"
  - "app/adapters/**/*.ts"
  - "drizzle/**"
  - "drizzle.config.ts"
---

# Data access

D1 is a network hop per query and the app is multi-tenant. Both are binding.

## Whose tables

- **The preset's** (`@firesio/app/preset/d1`, `plans/d1`): `shops`, `shop_probes`, `shop_subscriptions`, `shop_plan_grants`.
- **The app's own** (`app/db/schema.ts`): none yet; a derived app's tables go here (one file per feature, `app/db/<feature>.ts`, re-exported by `schema.ts`, once there are several), are passed to `createFiresio({ schema })` (every table with a `shop` column is erased on `shop/redact`) and are listed first in `drizzle.config.ts`. Their queries are the adapters' (`app/adapters/<feature>/`, handed `services.db` and the shop by their wiring), never a route's or core's (lint refuses both).
- **The libraries'** (`@firesio/app/*/d1`): the webhook inbox and tombstones, plan usage, support cases and the conversations they sit on (`conversations`, listed by hand in `drizzle.config.ts`), members, content edits, push devices, the notify kernel (`notify_deliveries`, `notify_suppressions`, `notify_consents`, `notify_scheduled`), jobs (`firesio_job_claims`, `firesio_dead_letters`), the settings audit and the checklist (`firesio_settings_audit`, `firesio_setup`), the portal outbox and its command runs. There is no AI table: the package has none since 2.0. Their schemas are `firesioSchemaPaths()` in `drizzle.config.ts` (a part the app opts into is an option of it: `{ settings: true }`, `{ messaging: true }`, and `{ metered: true }` once the plan catalogue has a `metered` feature); `npm run db:generate` sees all of them and writes ONE migration history in `./drizzle`. The app owns the migrations; a library never migrates anything.
- Adding a table: add it to the schema file (or pass the library's option to `firesioSchemaPaths()` in `drizzle.config.ts`), `npm run db:generate`, **read the SQL** (a CHECK of the app's own is Drizzle's `check()`, its values from the feature's vocabulary, `CLAUDE.md` "Layout"; Drizzle cannot express WITHOUT ROWID: where the library publishes `...TableSql()`, the migration must match it, as `plan_usage` and `plan_usage_holds` do), run the whole suite.

## Shop-scoped, always

Every app table carries `shop` (or `scope`, `subject`, `account_id` where a library names it). Every query includes it; every function of the app's own that reads or writes a table takes it as its **first parameter**. An id from a form or URL is attacker-controlled. A query that can read or write another shop's row is a **security defect**, and a test proving it cannot is part of the feature (a test beside the code, in workerd, against the real D1). `redacted_shops` is the one table without a shop: a hash and a time, nothing that identifies the shop. `shop/redact` deletes every shop-keyed table in ONE batch with the tombstone and the `account.redacted` outbox row (the preset's `purge/`): a table of `app/db/schema.ts` with a `shop` column is erased with no list to forget (the preset reads the schema); a table keyed by another column goes in `purge.shopScoped`, one that must survive in `purge.keep`, and the preset's `uncoveredShopTables(schemas, purgePlan(schemas))` is the test an app holds its own schema to.

## Raw SQL, bound values (a decision, and why)

The shared tables' adapters (the preset's and the libraries') use `env.DB.prepare(sql).bind(...)`; an adapter of the app's own does the same when its write belongs with a portal event. Why not Drizzle queries there: a write that belongs with a portal event must sit in the SAME `D1.batch` as the library's `enqueueStatement`, which is a prepared statement; Drizzle batches cannot hold one. Rules that keep it safe: every value is bound (`?1`), never interpolated; a table or column name from code is a literal in the file; no query inside a loop over fetched rows (batch it); every guard and its write are ONE statement or ONE batch (the `ON CONFLICT ... DO UPDATE ... WHERE` of the subscription store), never a read followed by a write that assumes the read still holds.

## Expand, then contract (the rule behind every migration)

A release applies its migrations BEFORE the new code is live (`npm run cf:deploy`, and Workers Builds), and D1 does not roll back with `wrangler rollback`: for a while the PREVIOUS code runs on the NEW schema, and after a rollback the old code runs on it for good. So a migration after the baseline may only ADD (a table, a column with a default, an index). `DROP TABLE`, `DROP COLUMN`, `RENAME` and `ALTER ... DROP` are the CONTRACT step: their own file named `<number>_<name>_contract.sql`, released one version AFTER the code stopped reading the thing. `tools/architecture/migration-guard.test.ts` runs `checkMigrations` over `drizzle/` and fails on a removal outside such a file (its `BASELINE` is the latest migration that existed when the guard was added: move it forward only after a release has shipped what it covers). `drizzle-kit generate` writes DROPs for what a package version stopped declaring: take them out by hand, say so in a comment at the top of the file, and list the tables in `CONTRACT_PENDING` of `schema-drift.test.ts` until the contract file drops them (`drizzle-kit` will not write them again: the snapshot no longer lists them). Test the rows with `tools/architecture/migration-rows.test.ts`.

## Migrations are forward-only

Once applied to production, never edit, rename or renumber a migration: a new one fixes a bad one. A derived app holds real rows, so a migration must keep them: a table a library renamed is a NEW table with its rows copied (`INSERT INTO ... SELECT`) in this release and the old one dropped by a later `*_contract.sql`: `RENAME` is refused in an expand migration, because the previous release still reads the old name (drizzle-kit asks "created or renamed?" and needs a terminal; answer "created" and write the copy by hand), never a drop and a create in one file, and a new NOT NULL column carries a default. `tools/architecture/migration-rows.test.ts` is the pattern: the history up to the migration, rows as the app wrote them, the rest, and the rows are still there. The template's `0000_baseline` is edited in place only until the first app deploys it (it is a new baseline: an app built on an earlier template migrates feature by feature, roadmap step 14). Adding a column is safe; removing one is two releases (stop reading, then a `*_contract.sql` drops it). A change under `drizzle/` or `app/db/` runs the **full** suite, and `npx drizzle-kit generate` must report "No schema changes" unless you meant one.

## Money

Integer minor units plus a currency, always together: `@firesio/app/money`. No `REAL` column for an amount.

## Failure boundaries

Independent panels fail independently with a sensible empty value **and a logged event**, never `catch {}`. **Degrade decoration, never correctness**: a badge may fall back to empty; an amount, an entitlement or a status the merchant acts on fails loudly.
