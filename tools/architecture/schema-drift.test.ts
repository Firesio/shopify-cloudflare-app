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

/**
 * The tables @firesio/app 2.0 replaced and the migration history still creates. `0006_firesio_2_0.sql` is EXPAND ONLY (a release applies its migrations before the
 * new code is live, and D1 does not roll back): the previous release still reads them, so the DROP of each is the NEXT release's `*_contract.sql` file
 * (`docs/migrating-to-2.0.md`), and its author deletes the name from this list with it. A table that is not in this list and not in a schema file fails the test above.
 */
const CONTRACT_PENDING: readonly string[] = [
  "notification_logs",
  "notification_preferences",
  "ai_models",
  "ai_runs",
  "ai_usage",
  "support_tickets",
  "support_messages",
  "support_attachments",
  "campaign_unsubscribes",
];

const NAME = "[`\"]?(\\w+)[`\"]?";
const TABLE_STATEMENT = new RegExp(`CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?${NAME}|DROP TABLE\\s+(?:IF EXISTS\\s+)?${NAME}|ALTER TABLE\\s+${NAME}\\s+RENAME TO\\s+${NAME}`, "gi");

/**
 * SQL as SQLite reads it, for the statement regex: its comments (`-- ...` to the end of the line, `/* ... *\/`) and the text of its
 * string literals (`'...'`, `''` inside) are blanked, quoted identifiers (`"..."`, `` `...` ``, `[...]`) kept. A hand-checked migration
 * explains itself in comments ("-- the old table is dropped below"), and the prose must not read as a table name.
 */
const COMMENT_STRING_OR_IDENTIFIER = /'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g;
const codeOf = (sql: string): string => sql.replace(COMMENT_STRING_OR_IDENTIFIER, (token) => (token.startsWith("'") || token.startsWith("--") || token.startsWith("/*") ? " " : token));

/**
 * The tables a migration history leaves behind: every `CREATE TABLE`, `DROP TABLE` and `ALTER TABLE ... RENAME TO`, in the order they
 * run (a renamed table is known by its new name only).
 */
function tablesLeftBy(sql: string): string[] {
  const tables = new Set<string>();
  for (const [, created, dropped, renamedFrom, renamedTo] of codeOf(sql).matchAll(TABLE_STATEMENT)) {
    if (created !== undefined) tables.add(created);
    if (dropped !== undefined) tables.delete(dropped);
    if (renamedFrom !== undefined && renamedTo !== undefined && tables.delete(renamedFrom)) tables.add(renamedTo);
  }
  return [...tables].sort();
}

/** The tables `drizzle/*.sql` leaves behind, the files in the order they run. */
function migratedTables(): string[] {
  return tablesLeftBy(readdirSync(join(root, "drizzle")).filter((name) => name.endsWith(".sql")).sort().map((name) => readFileSync(join(root, "drizzle", name), "utf8")).join("\n"));
}

describe("reading the migrations", () => {
  it("reads the statements, quoted or not, in the order they run", () => {
    const sql = "CREATE TABLE `a` (`id` text);\nCREATE TABLE IF NOT EXISTS \"b\" (id text);\ncreate table c (id text);\nALTER TABLE `a` RENAME TO `d`;\nDROP TABLE IF EXISTS c;";
    expect(tablesLeftBy(sql)).toEqual(["b", "d"]);
  });

  it("does not read a word in a comment or a string as a table", () => {
    const sql = [
      "-- the old table is dropped below: create table later",
      "CREATE TABLE `kept` (`note` text DEFAULT 'drop table kept' NOT NULL); -- then DROP TABLE kept, said in prose",
      "/* a block comment: CREATE TABLE ghost (id) */",
      "INSERT INTO `kept` VALUES ('create table it''s');--> statement-breakpoint",
    ].join("\n");
    expect(tablesLeftBy(sql)).toEqual(["kept"]);
  });
});

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

  it("creates no table that no listed schema file declares, except the old ones kept until the contract migration", async () => {
    const declared = new Set((await Promise.all(schemaFiles.map(tablesOf))).flat());
    for (const table of migratedTables()) {
      if (CONTRACT_PENDING.includes(table)) continue;
      expect(declared.has(table), `${table} is migrated but no schema file declares it (is a schema file missing from drizzle.config.ts?)`).toBe(true);
    }
  });

  it("keeps a table that 2.0 replaced only while it is listed as pending, and never one a schema file declares again", async () => {
    const declared = new Set((await Promise.all(schemaFiles.map(tablesOf))).flat());
    const migrated = new Set(migratedTables());
    for (const table of CONTRACT_PENDING) {
      expect(migrated.has(table), `${table} is listed as pending but no migration creates it: take it off CONTRACT_PENDING`).toBe(true);
      expect(declared.has(table), `${table} is declared by a schema file again: take it off CONTRACT_PENDING`).toBe(false);
    }
  });
});
