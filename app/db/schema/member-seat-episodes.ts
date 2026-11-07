import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * One time a shop had more active members than its plan's seats (`domain/member-seat-overage`). Only written by an app
 * that chose `notify_then_trim`; under the shipped `never_remove` the table stays empty.
 *
 * Shop-scoped like every merchant table. A shop has at most ONE open episode (`resolved_at` NULL): the partial unique
 * index makes two reviews that both find the shop over its limit open one between them, in the database and not by
 * convention. A resolved episode is kept as the record of what happened.
 *
 * Holds no personal data (no name or address of anyone): who was told or trimmed is in the log and in `shop_members`.
 * It goes with the rest of a shop's rows on `shop/redact`.
 */
export const memberSeatEpisodes = sqliteTable(
  "member_seat_episodes",
  {
    id: text("id").primaryKey(),
    shop: text("shop").notNull(),
    detectedAt: integer("detected_at").notNull(),
    /** When the notice was successfully handed to the notifier. Null until then, and a shop with no notice is never trimmed. */
    notifiedAt: integer("notified_at"),
    /** `notified_at` plus the notice period. Trimming happens only at or after it. */
    deadlineAt: integer("deadline_at"),
    resolvedAt: integer("resolved_at"),
    outcome: text("outcome", { enum: ["cancelled", "trimmed"] }),
    trimmedCount: integer("trimmed_count"),
  },
  (table) => [
    // At most one open episode per shop. The query that finds it repeats the literal condition.
    uniqueIndex("member_seat_episodes_open_idx")
      .on(table.shop)
      .where(sql`${table.resolvedAt} IS NULL`),
    // The cron sweep: open episodes only, across shops, by deadline. Partial, so it stays tiny while resolved ones pile up.
    index("member_seat_episodes_due_idx")
      .on(table.deadlineAt)
      .where(sql`${table.resolvedAt} IS NULL`),
  ],
);

export type MemberSeatEpisodeRow = typeof memberSeatEpisodes.$inferSelect;
