import { err, ok, type Result } from "~/lib/result";
import type { Notifier } from "~/ports/notifier";
import type { StaffNotificationRecipients } from "~/ports/staff-notifications";
import type { SupportRepository, SupportThread } from "~/ports/support";
import { excerpt } from "~/support/excerpt";
import { alertStaff, type StaffAlert } from "~/services/support-staff-alert";
import type { SupportCategory } from "~/support/categories";
import type { SupportTicket } from "~/support/types";
import { ATTACHMENT_TOKEN_TTL_MS } from "~/support/file-token";
import { replyChannels, replyRecipient } from "~/support/inbound/delivery";
import { buildThreadHeaders, referenceableMessageIds } from "~/support/inbound/headers";
import { supportAddress, ticketReplyAddress } from "~/support/inbound/reply-address";

/**
 * Support use cases: the merchant side and the staff side of one thread.
 *
 * Notifications are BEST EFFORT and always last. A mail transport being down
 * must never be the reason a bug report is lost — the ticket is already
 * committed by the time we try, and a failed send leaves a `failed` row in
 * `notification_logs` rather than an exception on the merchant's screen.
 */

export type OpenTicketFailure = "rate_limited";

interface Clock {
  now(): number;
}

export interface SupportServiceDependencies {
  readonly repo: SupportRepository;
  /** Who hears about a ticket, decided by each person's own notification settings. */
  readonly staff: StaffNotificationRecipients;
  readonly clock: Clock;
  readonly notifier: Notifier;
  readonly appUrl: string;
  /** The domain support mail lives on; null where it cannot receive mail (local dev). */
  readonly mailDomain: string | null;
  readonly withinRateLimit: (shop: string) => Promise<boolean>;
  readonly signAttachment: (attachmentId: string, expiresAt: number) => Promise<string>;
  /** Where a degraded path reports itself. Receives a stable event name, never a message body or an address. */
  readonly log: (entry: { readonly event: "support.notify_staff_failed"; readonly reason: string }) => void;
}

/** Where a thread lives, for the links inside notifications. */
function threadUrls(appUrl: string, ticketId: string) {
  const base = appUrl.replace(/\/+$/, "");
  return {
    merchant: `${base}/app/support/${ticketId}`,
    staff: `${base}/internal/support/${ticketId}`,
  };
}

/**
 * Ticket creation and replies are merchant-triggered writes that cost us rows,
 * storage and staff attention, so they go through the limiter.
 *
 * FAILS OPEN when the binding is absent: a missing limiter must never be the
 * reason a merchant cannot report a bug (@rules/cloudflare.md).
 */
export class SupportService {
  constructor(private readonly dependencies: SupportServiceDependencies) {}

  async adoptAttachments(
    shop: string,
    messageId: string,
    attachments: readonly Omit<Parameters<SupportRepository["attachMany"]>[0][number], "shop" | "messageId" | "at">[],
  ): Promise<void> {
    const at = this.dependencies.clock.now();
    await this.dependencies.repo.attachMany(attachments.map((attachment) => ({ shop, messageId, at, ...attachment })));
  }

  /** File a new ticket, then tell the staff who asked to hear about it. */
  async openTicket(input: {
    shop: string;
    shopName: string;
    merchantEmail: string | null;
    ccEmails: readonly string[];
    category: SupportCategory;
    subject: string;
    body: string;
    /**
     * The merchant's language, from the request that opened the ticket. Stored
     * because staff answer from the internal console, whose request knows
     * nothing about the merchant.
     */
    locale?: string | null;
  }): Promise<Result<{ id: string; messageId: string }, OpenTicketFailure>> {
    if (!(await this.dependencies.withinRateLimit(input.shop))) return err("rate_limited");

    const created = await this.dependencies.repo.open({
      ...input,
      // The shop is the author of its own first message.
      authorName: input.shopName,
      locale: input.locale ?? null,
      at: this.dependencies.clock.now(),
    });

    await this.notifyStaff({
      ticketId: created.id,
      shopName: input.shopName,
      subject: input.subject,
      body: input.body,
      isNew: true,
      messageId: created.messageId,
    });

    return ok(created);
  }

  /**
   * File a new ticket from staff side (e.g. following up on external merchant email).
   * Automatically sets author and lastAuthor to staff, then emails the merchant.
   */
  async openTicketAsStaff(input: {
    shop: string;
    shopName: string;
    merchantEmail: string | null;
    ccEmails: readonly string[];
    category: SupportCategory;
    subject: string;
    body: string;
    staffName: string;
    locale?: string | null;
  }): Promise<Result<{ id: string; messageId: string; shop: string }, never>> {
    const created = await this.dependencies.repo.openAsStaff({
      ...input,
      at: this.dependencies.clock.now(),
    });

    const thread = await this.dependencies.repo.findForStaff(created.id);
    if (thread) await this.notifyCustomer(thread, input.staffName, input.body, created.messageId);

    return ok({ ...created, shop: input.shop });
  }

  /** A merchant replies to their own thread. */
  async replyAsMerchant(input: {
    shop: string;
    shopName: string;
    ticketId: string;
    body: string;
  }): Promise<Result<null, OpenTicketFailure | "not_found">> {
    if (!(await this.dependencies.withinRateLimit(input.shop))) return err("rate_limited");

    const replied = await this.dependencies.repo.reply({
      shop: input.shop,
      ticketId: input.ticketId,
      author: "merchant",
      authorName: input.shopName,
      body: input.body,
      at: this.dependencies.clock.now(),
    });
    if (!replied) return err("not_found");

    const thread = await this.dependencies.repo.find(input.shop, input.ticketId);
    await this.notifyStaff({
      ticketId: input.ticketId,
      shopName: thread?.ticket.shopName ?? input.shopName,
      subject: thread?.ticket.subject ?? "",
      body: input.body,
      isNew: false,
      messageId: replied.messageId,
    });

    return ok(null);
  }

  /** Staff answer any shop's thread, then email the merchant. */
  async replyAsStaff(input: {
    ticketId: string;
    staffName: string;
    body: string;
  }): Promise<Result<{ shop: string | null; messageId: string }, "not_found">> {
    const replied = await this.dependencies.repo.replyAsStaff({
      ticketId: input.ticketId,
      authorName: input.staffName,
      body: input.body,
      at: this.dependencies.clock.now(),
    });
    if (!replied) return err("not_found");

    const thread = await this.dependencies.repo.findForStaff(input.ticketId);
    if (thread) await this.notifyCustomer(thread, input.staffName, input.body, replied.messageId);

    return ok(replied);
  }

  /** The shared staff fan-out; see `alertStaff`. */
  private notifyStaff(input: StaffAlert): Promise<void> {
    return alertStaff(this.dependencies, input);
  }

  /**
   * Email the person on the other side of the thread, if the thread's source
   * has an address for them.
   *
   * WHERE it goes, and whether the portal is also a channel, is the source's
   * decision (`SOURCE_DELIVERY`); this only addresses the message. A reader
   * with no portal gets the whole reply, since an excerpt and a link they
   * cannot open would be no answer at all. Every reply carries a
   * `support+<id>@` Reply-To, so an answer by email finds its way back.
   *
   * Their copy list rides the SAME send rather than becoming extra messages: a
   * copy is a carbon copy of one reply, so everyone sees one thread in their
   * mail client and the send leaves one row in `notification_logs`. `notify`
   * filters the list first — an opted-out address is dropped, and the primary
   * recipient is never also copied.
   */
  private async notifyCustomer(
    thread: SupportThread,
    staffName: string,
    body: string,
    messageId: string,
  ): Promise<void> {
    const { ticket, messages } = thread;
    const route = { source: ticket.source, replyAddress: ticket.replyAddress, merchantEmail: ticket.merchantEmail };
    const recipient = replyRecipient(route);
    const channels = replyChannels(route);
    if (recipient === null || !channels.includes("email")) return;

    const hasPortal = channels.includes("portal");
    const { mailDomain } = this.dependencies;
    const threadHeaders = buildThreadHeaders(referenceableMessageIds(ticket.source, messages));

    await this.dependencies.notifier.send({
      event: "support_staff_reply",
      to: { email: recipient },
      cc: { email: ticket.ccEmails },
      scope: ticket.shop ?? undefined,
      dedupeKey: `support-staff-reply:${messageId}`,
      payload: {
        recipientName: ticket.shopName,
        // Answer them in the language they asked in. `undefined` rather than
        // null so the email falls back to the app default.
        locale: ticket.locale ?? undefined,
        staffName,
        subject: ticket.subject,
        excerpt: excerpt(body),
        ...(hasPortal
          ? { threadUrl: threadUrls(this.dependencies.appUrl, ticket.id).merchant }
          : { body }),
        // The conversation speaks as support@ and is answered at support+<id>@,
        // both on the app's own domain.
        ...(mailDomain === null ? {} : { from: supportAddress(mailDomain), replyTo: ticketReplyAddress(mailDomain, ticket.id) }),
        ...(Object.keys(threadHeaders).length === 0 ? {} : { threadHeaders }),
      },
    });
  }

  /** Everything below is a thin pass-through; the repo owns the scoping. */
  listForShop(shop: string): Promise<SupportTicket[]> {
    return this.dependencies.repo.listForShop(shop);
  }

  find(shop: string, ticketId: string): Promise<SupportThread | undefined> {
    return this.dependencies.repo.find(shop, ticketId);
  }

  findForStaff(ticketId: string): Promise<SupportThread | undefined> {
    return this.dependencies.repo.findForStaff(ticketId);
  }

  listOpenForStaff(): Promise<SupportTicket[]> {
    return this.dependencies.repo.listOpenForStaff();
  }

  closeAsStaff(ticketId: string): Promise<boolean> {
    return this.dependencies.repo.closeAsStaff(ticketId, this.dependencies.clock.now());
  }

  setCcEmails(
    shop: string,
    ticketId: string,
    ccEmails: readonly string[],
  ): Promise<boolean> {
    return this.dependencies.repo.setCcEmails(shop, ticketId, ccEmails);
  }

  markMerchantRead(shop: string, ticketId: string): Promise<void> {
    return this.dependencies.repo.markRead(shop, ticketId, "merchant", this.dependencies.clock.now());
  }

  markStaffRead(ticketId: string): Promise<void> {
    return this.dependencies.repo.markReadAsStaff(ticketId, this.dependencies.clock.now());
  }

  /**
   * A URL for one attachment that carries its own authorisation.
   *
   * Called from a loader that has ALREADY proven the caller may read this
   * attachment. The token exists because the browser cannot re-prove it: an
   * `<img>` in the Shopify admin iframe sends no session token and no usable
   * cookie, so `/support/file/:id` has nothing to authenticate against
   * (see app/support/file-token.ts).
   */
  async attachmentUrl(attachmentId: string): Promise<string> {
    const token = await this.dependencies.signAttachment(
      attachmentId,
      this.dependencies.clock.now() + ATTACHMENT_TOKEN_TTL_MS,
    );
    return `/support/file/${attachmentId}?token=${token}`;
  }
}
