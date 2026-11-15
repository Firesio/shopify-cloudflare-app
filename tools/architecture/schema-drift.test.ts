import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import config from "../../drizzle.config";

/**
 * The database is ONE migration history in `drizzle/`, written by `drizzle-kit generate` from the schema files `drizzle.config.ts`
 * lists: the app's own and each library's. `drizzle-kit generate` reports "no changes" when the migrations and the schema agree, but
 * it needs the CLI and a clean tree; this is the same promise as a test, so `npm run verify` catches the day a library adds a table
 * (a bumped `@firesio/app`) or a schema file is dropped from the config and nobody ran `npm run db:generate`.
 */
const root = join(import.meta.dirname, "../..");

const schemaFiles: readonly string[] = Array.isArray(config.schema) ? config.schema : config.schema === undefined ? [] : [config.schema];

async function tablesOf(file: string): Promise<string[]> {
  const module: Record<string, unknown> = await import(join(root, file));
  return Object.values(module).flatMap((value) => (is(value, SQLiteTable) ? [getTableConfig(value).name] : []));
}

/** The tables the migrations create (and not drop again): every `CREATE TABLE` of every .sql file, in order. */
function migratedTables(): string[] {
  const sql = readdirSync(join(root, "drizzle")).filter((name) => name.endsWith(".sql")).sort().map((name) => readFileSync(join(root, "drizzle", name), "utf8")).join("\n");
  const tables = new Set<string>();
  for (const match of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"]?(\w+)[`"]?/gi)) tables.add(match[1] ?? "");
  for (const match of sql.matchAll(/DROP TABLE\s+(?:IF EXISTS\s+)?[`"]?(\w+)[`"]?/gi)) tables.delete(match[1] ?? "");
  return [...tables].sort();
}

describe("the migrations match the schema files drizzle.config.ts lists", () => {
  it("lists schema files that exist and declare tables", async () => {
    expect(schemaFiles.length).toBeGreaterThan(1);
    for (const file of schemaFiles.filter((name) => name !== "./app/db/schema.ts")) expect((await tablesOf(file)).length, file).toBeGreaterThan(0);
  });

  it("has a CREATE TABLE in drizzle/*.sql for every table of every listed schema file", async () => {
    const migrated = new Set(migratedTables());
    for (const file of schemaFiles) {
      for (const table of await tablesOf(file)) expect(migrated.has(table), `${table} (${file}) has no migration: run npm run db:generate and read the SQL`).toBe(true);
    }
  });

  it("creates no table that no listed schema file declares", async () => {
    const declared = new Set((await Promise.all(schemaFiles.map(tablesOf))).flat());
    for (const table of migratedTables()) expect(declared.has(table), `${table} is migrated but no schema file declares it (is a schema file missing from drizzle.config.ts?)`).toBe(true);
  });
});
