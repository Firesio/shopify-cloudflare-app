import { firesioSchemaPaths } from "@firesio/app/preset/schema";
import { defineConfig } from "drizzle-kit";

// D1 is SQLite. Migrations are generated into ./drizzle (`npm run db:generate`) and applied with `wrangler d1 migrations
// apply` (`npm run db:migrate:local` / `npm run db:migrate`). The app owns the migrations; `@firesio/app` ships the schema of the shared tables
// (the preset's, and each library's `/d1`), listed by `firesioSchemaPaths()` (add `{ settings: true }` or `{ messaging: true }` when the app declares them) so one `drizzle-kit generate` sees the whole database.
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: ["./app/db/schema.ts", ...firesioSchemaPaths({ settings: true })],
  out: "./drizzle",
  casing: "snake_case",
});
