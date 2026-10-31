import type { AudienceText } from "~/i18n/audience";
import type { UnitKeys } from "~/i18n/text-units";
import type { SupportStaffReplyPayload } from "~/notifications/payloads";
import { Cta, EmailLayout, Muted, P } from "../layout";
import { renderEmail, type RenderedEmail } from "../render";

/**
 * Merchant-facing: we answered their ticket.
 *
 * The excerpt is included rather than only a link, because a merchant checking
 * mail on a phone can often read the whole answer without opening the admin at
 * all — and the ones who do need to reply have the link.
 *
 * TRANSLATED, unlike the staff-facing templates beside it (those are English by this app's choice, see
 * @rules/i18n.md). This is the email a merchant reads, so it speaks the language `text` carries.
 */
export async function supportStaffReplyEmail(
  p: SupportStaffReplyPayload,
  text: AudienceText<UnitKeys<"email.support-reply">>,
): Promise<RenderedEmail> {
  const t = text.fixedT("email");
  // The ticket's subject is the app's own stored text: the reader sees it in their language when the app can translate it.
  const subject = await text.content({ kind: "support-ticket", id: p.ticketId, field: "subject", original: p.subject });
  // A reply with a body is shown whole, one paragraph per blank line; without
  // one the excerpt stands in and the link carries the rest.
  const paragraphs = (p.body ?? p.excerpt).split(/\n{2,}/).filter((part) => part.trim() !== "");

  // The same localized subject on the subject line and as the heading, so the two can never disagree.
  const rendered = await renderEmail(
    t("support.reply.subject", { subject }),
    <EmailLayout
      preview={p.excerpt}
      heading={subject}
      logoUrl={p.logoUrl}
      text={text}
    >
      <P>{t("support.reply.greeting", { name: p.recipientName })}</P>
      <P>{t("support.reply.intro", { staffName: p.staffName })}</P>
      {paragraphs.map((paragraph, index) => (
        <P key={index}>{paragraph}</P>
      ))}
      {p.threadUrl ? <Cta href={p.threadUrl} text={text}>{t("support.reply.cta")}</Cta> : null}
      <Muted>{t("support.reply.footer")}</Muted>
    </EmailLayout>,
  );

  return {
    ...rendered,
    ...(p.from ? { from: p.from } : {}),
    ...(p.replyTo ? { replyTo: p.replyTo } : {}),
    ...(p.threadHeaders ? { headers: p.threadHeaders } : {}),
  };
}
