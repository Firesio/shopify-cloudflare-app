import type { ThreadMessage } from "~/components/support/Thread";
import { replySchema, updateCcSchema } from "~/schemas/support";
import { statusOf } from "~/support/status";
import { supportService } from "~/wiring.server";

type SupportService = ReturnType<typeof supportService>;
type Thread = NonNullable<Awaited<ReturnType<SupportService["find"]>>>;

function attachmentKind(contentType: string): ThreadMessage["attachments"][number]["kind"] {
  if (contentType.startsWith("video/")) return "video";
  return contentType.startsWith("image/") ? "image" : "file";
}

/**
 * Every attachment URL is signed HERE, where the session has just proved this
 * shop owns the thread. The browser cannot prove it again: an <img> inside
 * the Shopify admin iframe sends no session token, which is why these files
 * used to render as a broken link instead of the screenshot.
 */
function threadMessages(service: SupportService, thread: Thread): Promise<ThreadMessage[]> {
  return Promise.all(
    thread.messages.map(async (message) => ({
      id: message.id,
      author: message.author,
      authorName: message.authorName,
      body: message.body,
      createdAt: message.createdAt,
      asksReview: message.asksReview,
      attachments: await Promise.all(
        thread.attachments
          .filter((file) => file.messageId === message.id)
          .map(async (file) => ({
            id: file.id,
            filename: file.filename,
            contentType: file.contentType,
            url: await service.attachmentUrl(file.id),
            sizeBytes: file.sizeBytes,
            kind: attachmentKind(file.contentType),
          })),
      ),
    })),
  );
}

/** `null` when the shop has no such ticket: a value, not a throw, because the page renders it. */
export async function readThread(shop: string, ticketId: string) {
  const service = supportService();
  const thread = await service.find(shop, ticketId);
  if (!thread) return null;

  // Opening the thread IS reading it. Done here rather than on an interaction,
  // so the unread badge clears by looking, like every other inbox.
  await service.markMerchantRead(shop, thread.ticket.id);

  return {
    ticket: {
      id: thread.ticket.id,
      subject: thread.ticket.subject,
      category: thread.ticket.category,
      status: statusOf(thread.ticket),
      closedAsksReview: thread.ticket.closedAsksReview,
      createdAt: thread.ticket.createdAt,
      ccEmails: thread.ticket.ccEmails,
    },
    messages: await threadMessages(service, thread),
  };
}

/**
 * Fresh signed URLs for a thread's attachments. A signed URL lasts an hour (`ATTACHMENT_TOKEN_TTL_MS`), so a thread left
 * open longer shows broken images until the links are signed again; the page asks for them when a file fails to load.
 * Does not mark the thread read: this is not the merchant opening it.
 */
export async function readAttachmentLinks(shop: string, ticketId: string): Promise<{ id: string; url: string }[]> {
  const service = supportService();
  const thread = await service.find(shop, ticketId);
  if (!thread) return [];
  return Promise.all(thread.attachments.map(async (file) => ({ id: file.id, url: await service.attachmentUrl(file.id) })));
}

export type ThreadActionError = "invalid_cc" | "empty_reply" | "not_found" | "rate_limited" | "invalid_upload";

export type ThreadActionOutcome =
  | { readonly ok: true; readonly success: "ccSaved" | "replied" }
  | { readonly ok: false; readonly error: ThreadActionError; readonly status: number };

const STATUS: Record<ThreadActionError, number> = {
  invalid_cc: 400,
  empty_reply: 400,
  invalid_upload: 400,
  not_found: 404,
  rate_limited: 429,
};

function refused(error: ThreadActionError): ThreadActionOutcome {
  return { ok: false, error, status: STATUS[error] };
}

type ThreadActionInput = { readonly shop: string; readonly ticketId: string; readonly form: FormData };

async function saveCc({ shop, ticketId, form }: ThreadActionInput): Promise<ThreadActionOutcome> {
  const parsed = updateCcSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return refused("invalid_cc");
  const saved = await supportService().setCcEmails(shop, ticketId, parsed.data.ccEmails);
  return saved ? { ok: true, success: "ccSaved" } : refused("not_found");
}

/**
 * A merchant's reply, with the files it carries.
 *
 * The message, the ticket's reopened status and the adopted files are written as one unit, against the id of the message
 * that was just stored (never "the newest message", which a staff reply could be). A closed ticket takes the reply and
 * reopens. The form's submission key makes a repeated send one message.
 */
async function reply({ shop, ticketId, form }: ThreadActionInput): Promise<ThreadActionOutcome> {
  const parsed = replySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return refused("empty_reply");

  // The shop name is the author of its own messages, and it is already stored on the ticket — no Shopify round trip.
  const service = supportService();
  const existing = await service.find(shop, ticketId);
  if (!existing) return refused("not_found");

  const replied = await service.replyAsMerchant({
    shop,
    shopName: existing.ticket.shopName,
    ticketId,
    body: parsed.data.body,
    submissionKey: parsed.data.submissionKey,
    uploadIds: parsed.data.uploadIds,
  });
  return replied.ok ? { ok: true, success: "replied" } : refused(replied.reason);
}

type Intent = "cc" | "reply";

/** Command dispatch on the form's `intent`; anything but `cc` is a reply, as before. */
const INTENTS: Record<Intent, (input: ThreadActionInput) => Promise<ThreadActionOutcome>> = {
  cc: saveCc,
  reply,
};

export function runThreadAction(input: ThreadActionInput): Promise<ThreadActionOutcome> {
  const intent: Intent = input.form.get("intent") === "cc" ? "cc" : "reply";
  return INTENTS[intent](input);
}
