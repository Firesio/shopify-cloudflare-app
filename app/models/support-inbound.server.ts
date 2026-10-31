import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "~/request-context.server";
import { supportMessages, supportTickets, type SupportTicket } from "~/db/schema";
import type {
  InboundMessageInput,
  InboundSupportRepository,
  InboundThreadRef,
  InboundWrite,
  OpenInboundInput,
} from "~/ports/support-inbound";
import type { ThreadLookupKeys } from "~/support/inbound/thread-match";
import { normalizeMessageId } from "~/support/inbound/thread-match";
import type { Ids } from "~/ports/runtime";

function participantsOf(ticket: SupportTicket): readonly string[] {
  return [ticket.merchantEmail, ...ticket.ccEmails, ticket.replyAddress].flatMap((address) =>
    address === null ? [] : [address.toLowerCase()],
  );
}

function toRef(ticket: SupportTicket): InboundThreadRef {
  return { id: ticket.id, shop: ticket.shop, participants: participantsOf(ticket) };
}

/**
 * The only place inbound-mail writes reach the support tables. Staff and
 * unassigned threads are deliberately not shop-scoped, so every method here is
 * either keyed by a ticket id the caller already matched or filtered to rows no
 * shop owns; `assignShop` is the single path from one to the other.
 */
export class SupportInboundRepo implements InboundSupportRepository {
  constructor(private readonly ids: Ids) {}

  async findThreads(keys: ThreadLookupKeys): Promise<readonly InboundThreadRef[]> {
    const db = getDb();
    const byTicketId =
      keys.ticketIds.length === 0
        ? []
        : await db.select().from(supportTickets).where(inArray(supportTickets.id, [...keys.ticketIds]));
    const byMessageId =
      keys.messageIds.length === 0
        ? []
        : await db
            .select({ ticket: supportTickets })
            .from(supportMessages)
            .innerJoin(supportTickets, eq(supportMessages.ticketId, supportTickets.id))
            .where(inArray(supportMessages.externalId, [...keys.messageIds]));

    const seen = new Set<string>();
    return [...byTicketId, ...byMessageId.map((row) => row.ticket)].flatMap((ticket) => {
      if (seen.has(ticket.id)) return [];
      seen.add(ticket.id);
      return [toRef(ticket)];
    });
  }

  async open(input: OpenInboundInput): Promise<InboundWrite<{ ticketId: string }>> {
    const ticketId = this.ids.uuid();
    const written = await this.writeUnlessDuplicate(input.externalId, () =>
      getDb().batch([
        getDb().insert(supportTickets).values({
          id: ticketId,
          shop: input.shop,
          source: input.source,
          replyAddress: input.replyAddress,
          shopName: input.shopName,
          merchantEmail: null,
          ccEmails: [],
          category: input.category,
          subject: input.subject,
          lastAuthor: "merchant",
          lastMessageAt: input.at,
          locale: null,
          createdAt: input.at,
        }),
        this.messageInsert(ticketId, input.shop, input),
      ]),
    );
    return written ? { status: "written", value: { ticketId } } : { status: "duplicate" };
  }

  async append(ticketId: string, input: InboundMessageInput): Promise<InboundWrite<{ messageId: string }>> {
    const db = getDb();
    const [ticket] = await db
      .select({ shop: supportTickets.shop })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);
    if (!ticket) return { status: "missing" };

    const messageId = this.ids.uuid();
    const written = await this.writeUnlessDuplicate(input.externalId, () =>
      db.batch([
        db.insert(supportMessages).values({
          id: messageId,
          ticketId,
          shop: ticket.shop,
          author: "merchant",
          authorName: input.senderName,
          body: input.body,
          externalId: normalizeMessageId(input.externalId),
          createdAt: input.at,
        }),
        // The customer coming back reopens the thread, as a merchant's reply does.
        db
          .update(supportTickets)
          .set({ lastAuthor: "merchant", lastMessageAt: input.at, closedAt: null })
          .where(eq(supportTickets.id, ticketId)),
      ]),
    );
    return written ? { status: "written", value: { messageId } } : { status: "duplicate" };
  }

  async assignShop(ticketId: string, shop: string): Promise<boolean> {
    const db = getDb();
    const [updated, , moved] = await db.batch([
      db
        .update(supportTickets)
        .set({ shop })
        .where(and(eq(supportTickets.id, ticketId), isNull(supportTickets.shop)))
        .returning({ id: supportTickets.id }),
      db
        .update(supportMessages)
        .set({ shop })
        .where(and(eq(supportMessages.ticketId, ticketId), isNull(supportMessages.shop))),
      db.select({ id: supportTickets.id }).from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.shop, shop))),
    ]);
    return updated.length > 0 && moved.length > 0;
  }

  private messageInsert(ticketId: string, shop: string | null, input: InboundMessageInput) {
    return getDb().insert(supportMessages).values({
      id: this.ids.uuid(),
      ticketId,
      shop,
      author: "merchant",
      authorName: input.senderName,
      body: input.body,
      externalId: normalizeMessageId(input.externalId),
      createdAt: input.at,
    });
  }

  /**
   * Runs the write; a unique violation on the mail's own id means the same mail
   * arrived twice, which is not an error. The check after a failure is what
   * tells a duplicate from a different fault, so only the former is swallowed.
   */
  private async writeUnlessDuplicate(externalId: string, write: () => Promise<unknown>): Promise<boolean> {
    const key = normalizeMessageId(externalId);
    if (await this.exists(key)) return false;
    try {
      await write();
      return true;
    } catch (cause) {
      if (await this.exists(key)) return false;
      throw cause;
    }
  }

  private async exists(externalId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: supportMessages.id })
      .from(supportMessages)
      .where(eq(supportMessages.externalId, externalId))
      .limit(1);
    return row !== undefined;
  }
}
