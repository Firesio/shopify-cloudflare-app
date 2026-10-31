import type {
  InboundMessageInput,
  InboundSupportRepository,
  InboundThreadRef,
  InboundWrite,
  OpenInboundInput,
} from "~/ports/support-inbound";
import type { ThreadLookupKeys } from "~/support/inbound/thread-match";

export interface FakeThread {
  readonly id: string;
  shop: string | null;
  readonly source: OpenInboundInput["source"];
  readonly participants: string[];
  readonly messages: { readonly externalId: string; readonly body: string; readonly senderName: string }[];
}

/**
 * In-memory `InboundSupportRepository`. Same contract as the D1 one: a mail id
 * stored twice is a duplicate, and a thread is found by its id or by a message
 * id it already holds. The real repo is covered against D1 separately.
 */
export class FakeSupportInbound implements InboundSupportRepository {
  readonly threads: FakeThread[] = [];
  private next = 1;

  async findThreads(keys: ThreadLookupKeys): Promise<readonly InboundThreadRef[]> {
    const byId = this.threads.filter((thread) => keys.ticketIds.includes(thread.id));
    const byMessage = this.threads.filter((thread) =>
      thread.messages.some((message) => keys.messageIds.includes(message.externalId)),
    );
    return [...new Set([...byId, ...byMessage])].map((thread) => ({
      id: thread.id,
      shop: thread.shop,
      participants: thread.participants,
    }));
  }

  async open(input: OpenInboundInput): Promise<InboundWrite<{ ticketId: string }>> {
    if (this.has(input.externalId)) return { status: "duplicate" };
    const id = `ticket-${this.next++}-abcdef`;
    this.threads.push({
      id,
      shop: input.shop,
      source: input.source,
      participants: [input.replyAddress.toLowerCase()],
      messages: [{ externalId: input.externalId, body: input.body, senderName: input.senderName }],
    });
    return { status: "written", value: { ticketId: id } };
  }

  async append(ticketId: string, input: InboundMessageInput): Promise<InboundWrite<{ messageId: string }>> {
    const thread = this.threads.find((candidate) => candidate.id === ticketId);
    if (!thread) return { status: "missing" };
    if (this.has(input.externalId)) return { status: "duplicate" };
    thread.messages.push({ externalId: input.externalId, body: input.body, senderName: input.senderName });
    return { status: "written", value: { messageId: `message-${this.next++}` } };
  }

  async assignShop(ticketId: string, shop: string): Promise<boolean> {
    const thread = this.threads.find((candidate) => candidate.id === ticketId);
    if (!thread || thread.shop !== null) return false;
    thread.shop = shop;
    return true;
  }

  private has(externalId: string): boolean {
    return this.threads.some((thread) => thread.messages.some((message) => message.externalId === externalId));
  }
}
