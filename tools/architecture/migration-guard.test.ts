import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkMigrations } from "@firesio/app/core/testing/migrations";
import { describe, expect, it } from "vitest";

/**
 * EXPAND, THEN CONTRACT (`.claude/rules/data.md`). A release applies its migrations BEFORE the new code is live, and D1 does not roll back with
 * `wrangler rollback`, so for a while the previous version's code runs on the new schema: a migration after the baseline may only ADD. A removal
 * (`DROP TABLE`, `DROP COLUMN`, `RENAME`, `ALTER ... DROP`) is its own file named `<number>_<name>_contract.sql`, released one version after the code
 * stopped reading the thing. The baseline is the latest migration that existed when the guard was added (the template's 2.0 move: `0005`, history); move it
 * forward only AFTER a release has shipped what it covers.
 */
const BASELINE = 5;
const folder = join(import.meta.dirname, "../../drizzle");
const files = readdirSync(folder).filter((name) => name.endsWith(".sql")).sort().map((name) => ({ name, sql: readFileSync(join(folder, name), "utf8") }));

describe("the migrations in drizzle/", () => {
  it("only add after the baseline: no DROP TABLE, DROP COLUMN, RENAME or ALTER ... DROP outside a *_contract.sql file", () => {
    expect(checkMigrations(files, { baseline: BASELINE })).toEqual([]);
  });

  it("is a guard that bites: a later DROP is named, and the same statement in a contract file is allowed", () => {
    const drop = { name: "0007_tidy.sql", sql: "ALTER TABLE `shops` ADD `x` text;\nDROP TABLE `notification_logs`;" };
    expect(checkMigrations([drop], { baseline: BASELINE })).toEqual([expect.stringContaining("0007_tidy.sql: DROP TABLE is not allowed in an expand migration")]);
    expect(checkMigrations([{ ...drop, name: "0007_tidy_contract.sql" }], { baseline: BASELINE })).toEqual([]);
    expect(checkMigrations([{ name: "0007_rename.sql", sql: "ALTER TABLE a RENAME TO b;" }], { baseline: BASELINE })).toHaveLength(1);
  });

  it("reads a word in a comment or a string as nothing", () => {
    expect(checkMigrations([{ name: "0007_note.sql", sql: "-- DROP TABLE later\nINSERT INTO t VALUES ('DROP COLUMN x');" }], { baseline: BASELINE })).toEqual([]);
  });
});
