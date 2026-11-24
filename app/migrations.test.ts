import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkMigrations } from "@firesio/app/core/testing/migrations";
import { describe, expect, it } from "vitest";

const FOLDER = path.join(import.meta.dirname, "..", "drizzle");

/** A release applies migrations before the new code is live, so a migration after the baseline may only add; a drop goes in a later `*_contract.sql`. */
describe("migrations expand first", () => {
  it("adds only, after the baseline", () => {
    const files = readdirSync(FOLDER)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => ({ name, sql: readFileSync(path.join(FOLDER, name), "utf8") }));
    expect(checkMigrations(files, { baseline: 8 })).toEqual([]);
  });
});
