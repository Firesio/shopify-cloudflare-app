import { firesioSchemaPaths } from "@firesio/app/preset/schema";
import { defineConfig } from "drizzle-kit";

// D1 is SQLite. Migrations are generated into ./drizzle (`npm run db:generate`) and applied with `wrangler d1 migrations
// apply` (`npm run db:migrate:local` / `npm run db:migrate`). The app owns the migrations; `@firesio/app` ships the schema of the shared tables
// (the preset's, and each library's `/d1`), listed by `firesioSchemaPaths()` (add `{ settings: true }`, `{ campaigns: true }` or `{ messaging: true }` when the app declares them, `{ metered: true }` when the plan catalogue has a `metered` feature) so one `drizzle-kit generate` sees the whole database.
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: [
    "./app/db/schema.ts",
    ...firesioSchemaPaths({ settings: true, setup: true, campaigns: true, news: true }),
    // The thread store a support case sits on (support runs on conversations since 2.0); `firesioSchemaPaths({ messaging: true })` lists it too when texting is declared.
    "./node_modules/@firesio/app/src/conversations/d1/schema.ts",
    // The staff phone app's tables (`app/core/features.ts`). Always in the history, so switching the part on needs no migration; empty while it is off.
    "./node_modules/@firesio/app/src/devices/d1/schema.ts",
  ],
  out: "./drizzle",
  casing: "snake_case",
});
