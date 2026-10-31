import type { SupportSource } from "./types";

export type DeliveryChannel = "portal" | "email";

/** The facts about a conversation a reply needs; no ids, no rows. */
export interface ReplyRoute {
  readonly source: SupportSource;
  /** The address of whoever started it, for sources that have no merchant record. */
  readonly replyAddress: string | null;
  readonly merchantEmail: string | null;
}

/**
 * How a source answers. One entry per source so the list is exhaustive: a new
 * source fails the build until it says where its replies go.
 */
interface SourceDelivery {
  /** Who owns the first mail in the thread, hence where `References` begins. */
  readonly rootOrigin: "inbound" | "outbound";
  readonly recipient: (route: ReplyRoute) => string | null;
  readonly channels: (route: ReplyRoute) => readonly DeliveryChannel[];
}

const toReplyAddress = (route: ReplyRoute): string | null => route.replyAddress;
const emailOnly = (): readonly DeliveryChannel[] => ["email"];

export const SOURCE_DELIVERY: Record<SupportSource, SourceDelivery> = {
  app_portal: {
    rootOrigin: "outbound",
    recipient: (route) => route.merchantEmail,
    channels: () => ["portal", "email"],
  },
  // The relay mail is Shopify's, never in the person's mailbox, so our first
  // reply starts the thread they see.
  shopify_relay: { rootOrigin: "outbound", recipient: toReplyAddress, channels: emailOnly },
  email: { rootOrigin: "inbound", recipient: toReplyAddress, channels: emailOnly },
  web_form: { rootOrigin: "outbound", recipient: toReplyAddress, channels: emailOnly },
};

export function replyRecipient(route: ReplyRoute): string | null {
  return SOURCE_DELIVERY[route.source].recipient(route);
}

/** Channels for a reply; email is dropped when there is nobody to send it to. */
export function replyChannels(route: ReplyRoute): readonly DeliveryChannel[] {
  const wanted = SOURCE_DELIVERY[route.source].channels(route);
  return replyRecipient(route) === null ? wanted.filter((channel) => channel !== "email") : wanted;
}
