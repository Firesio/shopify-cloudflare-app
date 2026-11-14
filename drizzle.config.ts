import { defineConfig } from "drizzle-kit";

// D1 is SQLite. Migrations are generated into ./drizzle (`npm run db:generate`) and applied with `wrangler d1 migrations
// apply` (`npm run db:migrate:local` / `npm run db:migrate`). The app owns the migrations; each library only ships the
// schema of its tables (`/d1`), listed here so one `drizzle-kit generate` sees the whole database.
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: [
    "./app/adapters/db/schema.ts",
    "./node_modules/@firesio/shopify/src/d1/schema.ts",
    "./node_modules/@firesio/plans/src/d1/schema.ts",
    "./node_modules/@firesio/support/src/d1/schema.ts",
    "./node_modules/@firesio/members/src/d1/schema.ts",
    "./node_modules/@firesio/content/src/d1/schema.ts",
    "./node_modules/@firesio/notify/src/push/d1/schema.ts",
    "./node_modules/@firesio/ai/src/d1/schema.ts",
    "./node_modules/@firesio/portal-client/src/d1/schema.ts",
  ],
  out: "./drizzle",
  casing: "snake_case",
});
