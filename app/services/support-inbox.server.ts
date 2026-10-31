import { err, ok, type Result } from "~/lib/result";
import type { Clock, Ids } from "~/ports/runtime";
import type { InboundSupportRepository, ShopDirectory } from "~/ports/support-inbound";
import type { ContactInput } from "~/schemas/support-contact";
import { alertStaff, type StaffAlertDependencies } from "~/services/support-staff-alert";
import { isAutomatedMail } from "~/support/inbound/automated";
import { PLAIN_EMAIL_SOURCE, detectMailSource } from "~/support/inbound/sources";
import { stripQuotedReply } from "~/support/inbound/quote";
import { normalizeMessageId, senderMayPost, threadLookupKeys } from "~/support/inbound/thread-match";
import type { NormalizedInbound, ParsedMail } from "~/support/inbound/types";

/** A mail longer than this is cut: a conversation, not a document store. */
export const INBOUND_BODY_MAX = 20_000;
const SUBJECT_MAX = 200;

export type ReceiveOutcome =
  | { readonly status: "appended"; readonly ticketId: string }
  | { readonly status: "opened"; readonly ticketId: string; readonly source: NormalizedInbound["source"] }
  | { readonly status: "duplicate" }
  | { readonly status: "ignored"; readonly reason: "no_message_id" | "automated" | "own_domain" | "empty" };

export interface SupportInboxDependencies extends StaffAlertDependencies {
  readonly repo: InboundSupportRepository;
  readonly shops: ShopDirectory;
  readonly clock: Clock;
  readonly ids: Ids;
  /** The domain this app's support mail lives on; null when it cannot receive mail. */
  readonly mailDomain: string | null;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

/**
 * Mail that reaches support, whoever sent it: put it in the conversation it
 * answers, or open one. Which source a NEW conversation belongs to is the
 * registry's call (`MAIL_SOURCES`); nothing here branches on a source.
 */
export class SupportInboxService {
  constructor(private readonly dependencies: SupportInboxDependencies) {}

  async receive(mail: ParsedMail): Promise<ReceiveOutcome> {
    if (mail.messageId === null) return { status: "ignored", reason: "no_message_id" };
    const externalId = normalizeMessageId(mail.messageId);
    if (this.isFromOwnDomain(mail)) return { status: "ignored", reason: "own_domain" };

    const existing = await this.findThread(mail);
    if (existing !== null) return this.append(existing, mail, externalId);
    return this.open(mail, externalId);
  }

  /**
   * A message from the public support form. There is no mail id, so the
   * conversation gets a fresh one; the sender is whoever typed their address.
   * The shop they name is used only when we know it, and an unknown one is
   * ignored quietly: the form must not tell a stranger which shops exist.
   */
  async submitForm(input: ContactInput): Promise<{ readonly ticketId: string }> {
    const shop = input.shop === null ? null : await this.dependencies.shops.find(input.shop);
    const shopName = shop?.name ?? input.name;
    const written = await this.dependencies.repo.open({
      externalId: `web-form:${this.dependencies.ids.uuid()}`,
      source: "web_form",
      shop: shop?.shop ?? null,
      shopName,
      replyAddress: input.email.toLowerCase(),
      senderName: input.name,
      subject: input.subject,
      body: input.message,
      category: "question",
      at: this.dependencies.clock.now(),
    });
    if (written.status !== "written") throw new Error("a form message id is never reused");

    await alertStaff(this.dependencies, {
      ticketId: written.value.ticketId,
      shopName,
      subject: input.subject,
      body: input.message,
      isNew: true,
      messageId: written.value.ticketId,
    });
    return { ticketId: written.value.ticketId };
  }

  /**
   * Give a conversation no shop owns yet to a shop we know. Refused for an
   * unknown domain (staff could mistype one) and for a thread that already has
   * an owner, which only the owner's shop may keep.
   */
  async assignShop(ticketId: string, shopDomain: string): Promise<Result<null, "unknown_shop" | "not_assignable">> {
    const shop = await this.dependencies.shops.find(shopDomain.trim().toLowerCase());
    if (shop === null) return err("unknown_shop");
    return (await this.dependencies.repo.assignShop(ticketId, shop.shop)) ? ok(null) : err("not_assignable");
  }

  private isFromOwnDomain(mail: ParsedMail): boolean {
    const { mailDomain } = this.dependencies;
    return mailDomain !== null && mail.from.address.toLowerCase().endsWith(`@${mailDomain}`);
  }

  /** The first thread the mail names whose participants include its sender. */
  private async findThread(mail: ParsedMail): Promise<{ readonly id: string; readonly shop: string | null } | null> {
    const { mailDomain, repo } = this.dependencies;
    const keys = threadLookupKeys(mail, mailDomain);
    if (keys.ticketIds.length === 0 && keys.messageIds.length === 0) return null;
    const threads = await repo.findThreads(keys);
    const match = threads.find((thread) => senderMayPost(thread.participants, mail.from.address));
    return match ?? null;
  }

  private async append(
    thread: { readonly id: string; readonly shop: string | null },
    mail: ParsedMail,
    externalId: string,
  ): Promise<ReceiveOutcome> {
    if (isAutomatedMail(mail)) return { status: "ignored", reason: "automated" };
    const body = clip(stripQuotedReply(mail.text), INBOUND_BODY_MAX);
    if (body === "") return { status: "ignored", reason: "empty" };

    const at = this.dependencies.clock.now();
    const written = await this.dependencies.repo.append(thread.id, {
      externalId,
      senderName: mail.from.name || mail.from.address,
      body,
      at,
    });
    if (written.status !== "written") return { status: "duplicate" };

    await alertStaff(this.dependencies, {
      ticketId: thread.id,
      shopName: mail.from.name || mail.from.address,
      subject: mail.subject,
      body,
      isNew: false,
      messageId: written.value.messageId,
    });
    return { status: "appended", ticketId: thread.id };
  }

  private async open(mail: ParsedMail, externalId: string): Promise<ReceiveOutcome> {
    const source = detectMailSource(mail);
    // Auto-replies and bounces are dropped, but never the one machine sender
    // that carries a human's message: that is the source's own match.
    if (source.source === PLAIN_EMAIL_SOURCE.source && isAutomatedMail(mail)) {
      return { status: "ignored", reason: "automated" };
    }

    const normalized = source.normalize(mail, externalId);
    // A source whose template changed falls back to treating it as plain mail,
    // so nothing a person wrote is lost to a parser that no longer fits.
    const result = normalized.ok ? normalized : PLAIN_EMAIL_SOURCE.normalize(mail, externalId);
    if (!result.ok) return { status: "ignored", reason: "empty" };
    const inbound = result.value;

    const shop = inbound.shopHint === null ? null : await this.dependencies.shops.find(inbound.shopHint);
    const body = clip(stripQuotedReply(inbound.body), INBOUND_BODY_MAX);
    if (body === "") return { status: "ignored", reason: "empty" };

    const written = await this.dependencies.repo.open({
      externalId,
      source: inbound.source,
      shop: shop?.shop ?? null,
      shopName: shop?.name ?? inbound.shopName ?? (inbound.senderName || inbound.senderEmail),
      replyAddress: inbound.senderEmail,
      senderName: inbound.senderName || inbound.senderEmail,
      subject: clip(inbound.subject, SUBJECT_MAX),
      body,
      category: "question",
      at: this.dependencies.clock.now(),
    });
    if (written.status !== "written") return { status: "duplicate" };

    await alertStaff(this.dependencies, {
      ticketId: written.value.ticketId,
      shopName: shop?.name ?? inbound.shopName ?? (inbound.senderName || inbound.senderEmail),
      subject: inbound.subject,
      body,
      isNew: true,
      messageId: externalId,
    });
    return { status: "opened", ticketId: written.value.ticketId, source: inbound.source };
  }
}
