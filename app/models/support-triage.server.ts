import { desc, eq } from "drizzle-orm";
import { supportBlockedSenders, supportQuarantine, type SupportBlockedSender, type SupportQuarantineRow } from "~/db/schema";
import type { BlockedSenders, HeldMail, NewHeldMail, SpamQuarantine } from "~/ports/support-triage";
import type { Ids } from "~/ports/runtime";
import { getDb } from "~/request-context.server";
import { toSupportSource } from "~/support/inbound/types";
import { SPAM_REASONS } from "~/support/triage/types";

/** How many held mails the console lists at once; the retention sweep keeps the table small. */
const HELD_LIST_MAX = 200;
/** The blocklist is read whole on every unknown mail, so it is bounded; a list this long is a different problem. */
const BLOCKED_READ_MAX = 1_000;

function toHeldMail(row: SupportQuarantineRow): HeldMail | null {
  const source = toSupportSource(row.source);
  const reason = SPAM_REASONS.find((candidate) => candidate === row.reason);
  // A retired variant (stored data outlives code) is skipped, never thrown on.
  if (source === null || reason === undefined) return null;
  return {
    id: row.id,
    externalId: row.externalId,
    source,
    reason,
    senderEmail: row.senderEmail,
    senderName: row.senderName,
    shopHint: row.shopHint,
    shopName: row.shopName,
    subject: row.subject,
    body: row.body,
    createdAt: row.createdAt,
  };
}

/**
 * The only place `support_quarantine` and `support_blocked_senders` are queried.
 *
 * Neither table has a `shop` (see the schema), so nothing here takes one: the held mail belongs to no shop until
 * a person releases it into an ordinary, shop-scoped ticket.
 */
export class SupportTriageRepo implements SpamQuarantine, BlockedSenders {
  constructor(private readonly ids: Ids) {}

  async hold(mail: NewHeldMail): Promise<boolean> {
    const stored = await getDb()
      .insert(supportQuarantine)
      .values({
        id: this.ids.uuid(),
        externalId: mail.externalId,
        source: mail.source,
        reason: mail.reason,
        senderEmail: mail.senderEmail,
        senderName: mail.senderName,
        shopHint: mail.shopHint,
        shopName: mail.shopName,
        subject: mail.subject,
        body: mail.body,
        createdAt: mail.createdAt,
      })
      .onConflictDoNothing()
      .returning({ id: supportQuarantine.id });
    return stored.length > 0;
  }

  async find(id: string): Promise<HeldMail | null> {
    const [row] = await getDb().select().from(supportQuarantine).where(eq(supportQuarantine.id, id)).limit(1);
    return row === undefined ? null : toHeldMail(row);
  }

  /** Newest first, at most `HELD_LIST_MAX`. */
  async listHeld(): Promise<HeldMail[]> {
    const rows = await getDb().select().from(supportQuarantine).orderBy(desc(supportQuarantine.createdAt)).limit(HELD_LIST_MAX);
    return rows.flatMap((row) => toHeldMail(row) ?? []);
  }

  async discard(id: string): Promise<boolean> {
    const removed = await getDb().delete(supportQuarantine).where(eq(supportQuarantine.id, id)).returning({ id: supportQuarantine.id });
    return removed.length > 0;
  }

  /** Every held mail from one mailbox; how many were removed. */
  async discardFromSender(senderEmail: string): Promise<number> {
    const removed = await getDb()
      .delete(supportQuarantine)
      .where(eq(supportQuarantine.senderEmail, senderEmail))
      .returning({ id: supportQuarantine.id });
    return removed.length;
  }

  async patterns(): Promise<readonly string[]> {
    const rows = await getDb().select({ pattern: supportBlockedSenders.pattern }).from(supportBlockedSenders).limit(BLOCKED_READ_MAX);
    return rows.map((row) => row.pattern);
  }

  async listBlocked(): Promise<SupportBlockedSender[]> {
    return getDb().select().from(supportBlockedSenders).orderBy(desc(supportBlockedSenders.createdAt)).limit(BLOCKED_READ_MAX);
  }

  /** Idempotent: blocking a pattern twice keeps the first entry and its author. */
  async block(input: { readonly pattern: string; readonly createdBy: string; readonly at: number }): Promise<void> {
    await getDb()
      .insert(supportBlockedSenders)
      .values({ pattern: input.pattern, createdBy: input.createdBy, createdAt: input.at })
      .onConflictDoNothing();
  }

  async unblock(pattern: string): Promise<void> {
    await getDb().delete(supportBlockedSenders).where(eq(supportBlockedSenders.pattern, pattern));
  }
}
