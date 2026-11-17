import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

/**
 * A derived app holds real rows when it takes a migration, and the workerd suites only ever apply the whole history to an EMPTY
 * database (a real local D1, `setupTestDatabase`). This is the other half: the migrations up to a point, rows as the app wrote
 * them then, the rest of the history, and the rows are still there. SQLite itself (`node:sqlite`), the engine D1 runs.
 */
const folder = join(import.meta.dirname, "../../drizzle");
const files = readdirSync(folder).filter((name) => name.endsWith(".sql")).sort();

/** A database migrated up to, and not including, the migration `tag` names; `finish()` applies that one and every later one. */
function migratedBefore(tag: string) {
  const at = files.findIndex((name) => name.startsWith(tag));
  if (at < 0) throw new Error(`no migration ${tag} in drizzle/`);
  const db = new DatabaseSync(":memory:");
  const apply = (names: readonly string[]) => names.forEach((name) => db.exec(readFileSync(join(folder, name), "utf8")));
  apply(files.slice(0, at));
  return { db, finish: () => apply(files.slice(at)) };
}

const tablesOf = (db: DatabaseSync) => db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((row) => row["name"]);

describe("0003: the settings table is renamed, not rebuilt", () => {
  const SETTINGS = `INSERT INTO shop_settings (shop, settings_group, revision, version, value, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)`;

  it("keeps every settings row a shop saved before the migration, under the new name", () => {
    const { db, finish } = migratedBefore("0003");
    db.prepare(SETTINGS).run("one.myshopify.com", "general", 3, 1, `{"signature":"Kind regards"}`, 1_700_000_000_000, "member:m1");
    db.prepare(SETTINGS).run("two.myshopify.com", "general", 1, 1, `{"signature":""}`, 1_700_000_000_001, "member:m2");
    finish();
    expect(tablesOf(db)).toContain("firesio_settings");
    expect(tablesOf(db)).not.toContain("shop_settings");
    expect(db.prepare(`SELECT * FROM firesio_settings ORDER BY shop`).all().map((row) => ({ ...row }))).toEqual([
      { shop: "one.myshopify.com", settings_group: "general", revision: 3, version: 1, value: `{"signature":"Kind regards"}`, updated_at: 1_700_000_000_000, updated_by: "member:m1" },
      { shop: "two.myshopify.com", settings_group: "general", revision: 1, version: 1, value: `{"signature":""}`, updated_at: 1_700_000_000_001, updated_by: "member:m2" },
    ]);
  });

  it("keeps the primary key: one row per shop and group", () => {
    const { db, finish } = migratedBefore("0003");
    db.prepare(SETTINGS).run("one.myshopify.com", "general", 1, 1, "{}", 1, "member:m1");
    finish();
    const again = db.prepare(SETTINGS.replace("shop_settings", "firesio_settings"));
    expect(() => again.run("one.myshopify.com", "general", 2, 1, "{}", 2, "member:m1")).toThrow(/UNIQUE|PRIMARY/i);
    expect(() => again.run("one.myshopify.com", "other", 1, 1, "{}", 2, "member:m1")).not.toThrow();
  });
});

describe("0003: content_overrides gains `hidden`", () => {
  it("gives a merchant's saved edit no hidden part, and keeps the edit", () => {
    const { db, finish } = migratedBefore("0003");
    db.prepare(`INSERT INTO content_overrides (account_id, key, locale, parts, default_fingerprint, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run("one.myshopify.com", "mail.support_reply", "en", `{"intro":"Hello"}`, "abc", 5);
    finish();
    expect({ ...db.prepare(`SELECT * FROM content_overrides`).get() }).toEqual({ account_id: "one.myshopify.com", key: "mail.support_reply", locale: "en", parts: `{"intro":"Hello"}`, hidden: "[]", default_fingerprint: "abc", updated_at: 5 });
  });
});

describe("0003: plan_usage_holds is the table the library publishes (`holdsTableSql`), CHECKs included", () => {
  const HOLD = `INSERT INTO plan_usage_holds (hold_id, subject, operation_id, counter, period, amount, committed, state, created_at, expires_at) VALUES (?, 'one.myshopify.com', ?, 'orders.monthly', '2026-11', ?, ?, ?, 1, 2)`;

  it("takes a hold and refuses a state, an amount or a committed count the library never writes", () => {
    const { db, finish } = migratedBefore("0003");
    finish();
    const insert = db.prepare(HOLD);
    expect(() => insert.run("h1", "op1", 5, 0, "held")).not.toThrow();
    expect(() => insert.run("h2", "op2", 5, 0, "paused")).toThrow(/CHECK/i);
    expect(() => insert.run("h3", "op3", 0, 0, "held")).toThrow(/CHECK/i);
    expect(() => insert.run("h4", "op4", 5, 6, "committed")).toThrow(/CHECK/i);
    expect(() => insert.run("h5", "op1", 5, 0, "held")).toThrow(/UNIQUE/i);
  });
});
