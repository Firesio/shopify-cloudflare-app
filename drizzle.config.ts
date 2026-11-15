import { defineConfig } from "drizzle-kit";

// D1 is SQLite. Migrations are generated into ./drizzle (`npm run db:generate`) and applied with `wrangler d1 migrations
// apply` (`npm run db:migrate:local` / `npm run db:migrate`). The app owns the migrations; `@firesio/app` ships the schema of the shared tables
// (the preset's, and each library's `/d1`), listed here so one `drizzle-kit generate` sees the whole database.
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: [
    "./app/db/schema.ts",
    "./node_modules/@firesio/app/src/preset/d1/schema.ts",
    "./node_modules/@firesio/app/src/shopify/d1/schema.ts",
    "./node_modules/@firesio/app/src/plans/d1/schema.ts",
    "./node_modules/@firesio/app/src/support/d1/schema.ts",
    "./node_modules/@firesio/app/src/members/d1/schema.ts",
    "./node_modules/@firesio/app/src/content/d1/schema.ts",
    "./node_modules/@firesio/app/src/notify/push/d1/schema.ts",
    "./node_modules/@firesio/app/src/ai/d1/schema.ts",
    "./node_modules/@firesio/app/src/portal-client/d1/schema.ts",
  ],
  out: "./drizzle",
  casing: "snake_case",
});
