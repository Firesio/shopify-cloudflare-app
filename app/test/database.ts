import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";
import { z } from "zod";

/** The shape `readD1Migrations` hands to workerd, parsed rather than cast. */
const migrationsSchema = z.array(z.object({ name: z.string(), queries: z.array(z.string()) }));

let migrated = false;

async function ensureMigrated(db: D1Database): Promise<void> {
  if (migrated) return;
  await applyD1Migrations(db, migrationsSchema.parse(JSON.parse(env.TEST_MIGRATIONS)));
  migrated = true;
}

/** Every application table, read from the catalog: a new table is covered by the next run with no list to forget. */
async function applicationTables(db: D1Database): Promise<string[]> {
  const rows = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'`).all();
  return rows.results.flatMap((row) => (typeof row["name"] === "string" ? [row["name"]] : []));
}

/** Empty every application table in ONE round trip (a D1 batch is one transaction; the app declares no foreign keys between its tables). */
export async function clearAllTables(db: D1Database): Promise<void> {
  const tables = await applicationTables(db);
  if (tables.length > 0) await db.batch(tables.map((name) => db.prepare(`DELETE FROM "${name}"`)));
}

/**
 * Give each test a clean database: the real migrations on a real D1, applied once per runtime, and every table emptied before
 * each test. `applyD1Migrations` alone does NOT reset data. Call once at the top of a test file.
 */
export function setupTestDatabase(): void {
  beforeEach(async () => {
    await ensureMigrated(env.DB);
    await clearAllTables(env.DB);
  });
}
