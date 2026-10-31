import type { SupportCategory } from "~/support/categories";
import type { SupportSource } from "~/support/inbound/types";
import type { ThreadLookupKeys } from "~/support/inbound/thread-match";

/** A thread a received mail might belong to, with everyone already in it. */
export interface InboundThreadRef {
  readonly id: string;
  readonly shop: string | null;
  readonly participants: readonly string[];
}

export interface InboundMessageInput {
  readonly externalId: string;
  readonly senderName: string;
  readonly body: string;
  readonly at: number;
}

export interface OpenInboundInput extends InboundMessageInput {
  readonly source: SupportSource;
  readonly shop: string | null;
  readonly shopName: string;
  readonly replyAddress: string;
  readonly subject: string;
  readonly category: SupportCategory;
}

export type InboundWrite<T> =
  | { readonly status: "written"; readonly value: T }
  /** The same mail was already stored; nothing was written. */
  | { readonly status: "duplicate" }
  /** The thread it named no longer exists; nothing was written. */
  | { readonly status: "missing" };

export interface InboundSupportRepository {
  /** Threads named by the keys. Ticket-id matches come first, then message-id matches. */
  findThreads(keys: ThreadLookupKeys): Promise<readonly InboundThreadRef[]>;
  open(input: OpenInboundInput): Promise<InboundWrite<{ ticketId: string }>>;
  append(ticketId: string, input: InboundMessageInput): Promise<InboundWrite<{ messageId: string }>>;
  /** Gives an unassigned conversation to a shop. False when it is gone or already owned. */
  assignShop(ticketId: string, shop: string): Promise<boolean>;
}

/** The shops this app knows, so a mail can name one without inventing it. */
export interface ShopDirectory {
  find(shopDomain: string): Promise<{ readonly shop: string; readonly name: string } | null>;
}
