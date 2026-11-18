import { DatabaseSync } from "node:sqlite";
import { sql } from "drizzle-orm";
import { check, getTableConfig, SQLiteSyncDialect, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

/**
 * The recipe of `CLAUDE.md` ("Layout", a value list core and db both need), as written there: the list is declared ONCE, in the
 * feature's vocabulary (`app/core/orders/vocabulary.ts`), and the table's CHECK constraint is built from it (`app/db/orders.ts`).
 * Here both halves sit in one file (lint holds the real files to the layout: `boundaries.test.ts`); this proves the constraint the
 * recipe writes is a real one, with its values inlined (DDL takes no bound parameter), in SQLite itself (`node:sqlite`).
 */

// app/core/orders/vocabulary.ts
const ORDER_STATUSES = ["open", "closed"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

// app/db/orders.ts
const orders = sqliteTable(
  "orders",
  {
    id: text().primaryKey(),
    shop: text().notNull(),
    status: text({ enum: ORDER_STATUSES }).notNull(),
  },
  // The values are the vocabulary's literals (it imports nothing, so no input can reach them), inlined because DDL binds nothing.
  (table) => [check("orders_status", sql`${table.status} IN (${sql.raw(ORDER_STATUSES.map((status) => `'${status}'`).join(", "))})`)],
);

describe("a value list declared once, in the vocabulary, and checked by the table", () => {
  const [constraint] = getTableConfig(orders).checks;
  const rendered = constraint === undefined ? null : new SQLiteSyncDialect().sqlToQuery(constraint.value);

  it("writes the list into the CHECK constraint, with no bound parameter", () => {
    expect(rendered).toEqual({ sql: `"orders"."status" IN ('open', 'closed')`, params: [] });
  });

  it("refuses a value the vocabulary does not list, in SQLite", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE orders (id text PRIMARY KEY, shop text NOT NULL, status text NOT NULL, CHECK (${rendered?.sql ?? "false"}))`);
    const insert = db.prepare("INSERT INTO orders (id, shop, status) VALUES (?, ?, ?)");
    const known: OrderStatus = "closed";
    expect(() => insert.run("o1", "one.myshopify.com", known)).not.toThrow();
    expect(() => insert.run("o2", "one.myshopify.com", "cancelled")).toThrow(/CHECK constraint failed/);
  });
});
