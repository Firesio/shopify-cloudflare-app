import { err, ok, type Result } from "~/lib/result";
import type { Clock, Ids } from "~/ports/runtime";
import type { InboundSupportRepository, ShopDirectory } from "~/ports/support-inbound";
import type { InboundTriage, SpamQuarantine } from "~/ports/support-triage";
import type { ContactInput } from "~/schemas/support-contact";
import { alertStaff, type StaffAlertDependencies } from "~/services/support-staff-alert";
import { isAutomatedMail } from "~/support/inbound/automated";
import { PLAIN_EMAIL_SOURCE, detectMailSource, type MailSource } from "~/support/inbound/sources";
import { stripQuotedReply } from "~/support/inbound/quote";
import { normalizeMessageId, senderMayPost, threadLookupKeys } from "~/support/inbound/thread-match";
import type { NormalizedInbound, ParsedMail } from "~/support/inbound/types";
import type { SpamReason } from "~/support/triage/types";

/** A mail longer than this is cut: a conversation, not a document store. */
export const INBOUND_BODY_MAX = 20_000;
const SUBJECT_MAX = 200;

export type ReceiveOutcome =
  | { readonly status: "appended"; readonly ticketId: string }
  | { readonly status: "opened"; readonly ticketId: string; readonly source: NormalizedInbound["source"] }
  /** Held back as probable spam: no conversation, no alert. A person may release it from the Spam page. */
  | { readonly status: "quarantined"; readonly reason: SpamReason }
  | { readonly status: "duplicate" }
  | { readonly status: "ignored"; readonly reason: "no_message_id" | "automated" | "own_domain" | "empty" };

export interface SupportInboxDependencies extends StaffAlertDependencies {
  readonly repo: InboundSupportRepository;
  readonly triage: InboundTriage;
  readonly quarantine: SpamQuarantine;
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

  /**
   * Give a held mail the conversation it would have had. Idempotent: a mail already released (a double click, a second
   * staff member) finds nothing to release, and a ticket that already exists for it is not duplicated.
   */
  async release(heldId: string): Promise<Result<{ readonly ticketId: string }, "missing">> {
    const { quarantine } = this.dependencies;
    const held = await quarantine.find(heldId);
    if (held === null) return err("missing");

    const outcome = await this.openConversation(held);
    await quarantine.discard(heldId);
    return outcome.status === "opened" ? ok({ ticketId: outcome.ticketId }) : err("missing");
  }

  private async open(mail: ParsedMail, externalId: string): Promise<ReceiveOutcome> {
    const source = detectMailSource(mail);
    // Auto-replies and bounces are dropped, but never the one machine sender
    // that carries a human's message: that is the source's own match.
    if (source.source === PLAIN_EMAIL_SOURCE.source && isAutomatedMail(mail)) {
      return { status: "ignored", reason: "automated" };
    }

    const inbound = this.normalize(source, mail, externalId);
    if (inbound === null) return { status: "ignored", reason: "empty" };

    const decision = await this.dependencies.triage.assess({
      source: inbound.source,
      senderEmail: inbound.senderEmail,
      subject: inbound.subject,
      body: inbound.body,
    });
    return decision.action === "open" ? this.openConversation(inbound) : this.hold(inbound, decision.reason);
  }

  /** The mail as a conversation would store it: through its source, with the body and subject cut to size. */
  private normalize(source: MailSource, mail: ParsedMail, externalId: string): NormalizedInbound | null {
    const normalized = source.normalize(mail, externalId);
    // A source whose template changed falls back to treating it as plain mail,
    // so nothing a person wrote is lost to a parser that no longer fits.
    const result = normalized.ok ? normalized : PLAIN_EMAIL_SOURCE.normalize(mail, externalId);
    if (!result.ok) return null;

    const body = clip(stripQuotedReply(result.value.body), INBOUND_BODY_MAX);
    if (body === "") return null;
    return { ...result.value, subject: clip(result.value.subject, SUBJECT_MAX), body };
  }

  private async openConversation(inbound: NormalizedInbound): Promise<ReceiveOutcome> {
    const shop = inbound.shopHint === null ? null : await this.dependencies.shops.find(inbound.shopHint);
    const shopName = shop?.name ?? inbound.shopName ?? (inbound.senderName || inbound.senderEmail);

    const written = await this.dependencies.repo.open({
      externalId: inbound.externalId,
      source: inbound.source,
      shop: shop?.shop ?? null,
      shopName,
      replyAddress: inbound.senderEmail,
      senderName: inbound.senderName || inbound.senderEmail,
      subject: inbound.subject,
      body: inbound.body,
      category: "question",
      at: this.dependencies.clock.now(),
    });
    if (written.status !== "written") return { status: "duplicate" };

    await alertStaff(this.dependencies, {
      ticketId: written.value.ticketId,
      shopName,
      subject: inbound.subject,
      body: inbound.body,
      isNew: true,
      messageId: inbound.externalId,
    });
    return { status: "opened", ticketId: written.value.ticketId, source: inbound.source };
  }

  /** Held, not opened: nobody is alerted, because nothing here is a conversation yet. */
  private async hold(inbound: NormalizedInbound, reason: SpamReason): Promise<ReceiveOutcome> {
    const held = await this.dependencies.quarantine.hold({ ...inbound, reason, createdAt: this.dependencies.clock.now() });
    return held ? { status: "quarantined", reason } : { status: "duplicate" };
  }
}
