import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { memberSeatEpisodes, type MemberSeatEpisodeRow } from "~/db/schema";
import type { MemberSeatEpisodes, SeatEpisode } from "~/ports/member-seat-overage";
import { getDb } from "~/request-context.server";

function toEpisode(row: MemberSeatEpisodeRow): SeatEpisode {
  return {
    id: row.id,
    shop: row.shop,
    detectedAt: row.detectedAt,
    notifiedAt: row.notifiedAt,
    deadlineAt: row.deadlineAt,
    resolvedAt: row.resolvedAt,
    outcome: row.outcome,
    trimmedCount: row.trimmedCount,
  };
}

/**
 * The ONLY place `member_seat_episodes` is queried. Every method but the cron's `listDue` takes `shop` first, and every
 * write repeats it in its WHERE, so an episode id alone can never reach another shop's row.
 *
 * "Open" is the literal condition `resolved_at IS NULL`, repeated in each query: the partial indexes only serve a query
 * that states it (a bound parameter cannot use them).
 */
export class MemberSeatEpisodeRepo implements MemberSeatEpisodes {
  async findOpen(shop: string): Promise<SeatEpisode | undefined> {
    const row = await getDb()
      .select()
      .from(memberSeatEpisodes)
      .where(and(eq(memberSeatEpisodes.shop, shop), isNull(memberSeatEpisodes.resolvedAt)))
      .get();
    return row === undefined ? undefined : toEpisode(row);
  }

  async open(shop: string, input: { readonly id: string; readonly now: number }): Promise<{ readonly episode: SeatEpisode; readonly created: boolean } | undefined> {
    // One statement: the partial unique index lets exactly one of two racing reviews insert; the other reads the winner's.
    const [inserted] = await getDb()
      .insert(memberSeatEpisodes)
      .values({ id: input.id, shop, detectedAt: input.now })
      .onConflictDoNothing()
      .returning();
    if (inserted !== undefined) return { episode: toEpisode(inserted), created: true };
    const winner = await this.findOpen(shop);
    return winner === undefined ? undefined : { episode: winner, created: false };
  }

  async markNotified(shop: string, id: string, input: { readonly notifiedAt: number; readonly deadlineAt: number }): Promise<boolean> {
    const rows = await getDb()
      .update(memberSeatEpisodes)
      .set({ notifiedAt: input.notifiedAt, deadlineAt: input.deadlineAt })
      .where(and(eq(memberSeatEpisodes.shop, shop), eq(memberSeatEpisodes.id, id), isNull(memberSeatEpisodes.resolvedAt), isNull(memberSeatEpisodes.notifiedAt)))
      .returning({ id: memberSeatEpisodes.id });
    return rows.length > 0;
  }

  async resolve(shop: string, id: string, input: { readonly outcome: "cancelled" | "trimmed"; readonly trimmedCount: number | null; readonly now: number }): Promise<boolean> {
    const rows = await getDb()
      .update(memberSeatEpisodes)
      .set({ resolvedAt: input.now, outcome: input.outcome, trimmedCount: input.trimmedCount })
      .where(and(eq(memberSeatEpisodes.shop, shop), eq(memberSeatEpisodes.id, id), isNull(memberSeatEpisodes.resolvedAt)))
      .returning({ id: memberSeatEpisodes.id });
    return rows.length > 0;
  }

  async listDue(now: number, limit: number): Promise<readonly string[]> {
    // Across shops on purpose, bounded. An episode that was never notified is due now (its notice is retried); a notified
    // one is due at its deadline. Open episodes are at most one per shop, so the partial index holds few rows.
    const rows = await getDb()
      .select({ shop: memberSeatEpisodes.shop })
      .from(memberSeatEpisodes)
      .where(and(isNull(memberSeatEpisodes.resolvedAt), or(isNull(memberSeatEpisodes.notifiedAt), lte(memberSeatEpisodes.deadlineAt, now))))
      .orderBy(asc(sql`coalesce(${memberSeatEpisodes.deadlineAt}, ${memberSeatEpisodes.detectedAt})`), asc(memberSeatEpisodes.shop))
      .limit(limit);
    return rows.map((row) => row.shop);
  }
}
