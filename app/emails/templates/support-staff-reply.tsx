import type { SupportStaffReplyPayload } from "~/notifications/payloads";
import { Cta, EmailLayout, Muted, P } from "../layout";
import { renderEmail, type RenderedEmail } from "../render";
import { emailT } from "../translate.server";

/**
 * Merchant-facing: we answered their ticket.
 *
 * The excerpt is included rather than only a link, because a merchant checking
 * mail on a phone can often read the whole answer without opening the admin at
 * all — and the ones who do need to reply have the link.
 *
 * TRANSLATED, unlike the two staff-facing templates beside it. This is the one
 * email in the app a merchant reads, so @rules/i18n.md applies in full: it used
 * to be hardcoded English even though the payload already carried `locale`,
 * which meant a Spanish merchant asked a question in Spanish and got answered
 * in English.
 */
export async function supportStaffReplyEmail(
  p: SupportStaffReplyPayload,
): Promise<RenderedEmail> {
  const t = await emailT(p.locale);
  // A reply with a body is shown whole, one paragraph per blank line; without
  // one the excerpt stands in and the link carries the rest.
  const paragraphs = (p.body ?? p.excerpt).split(/\n{2,}/).filter((part) => part.trim() !== "");

  const rendered = await renderEmail(
    t("support.reply.subject", { subject: p.subject }),
    <EmailLayout
      preview={p.excerpt}
      heading={p.subject}
      logoUrl={p.logoUrl}
      locale={p.locale}
    >
      <P>{t("support.reply.greeting", { name: p.recipientName })}</P>
      <P>{t("support.reply.intro", { staffName: p.staffName })}</P>
      {paragraphs.map((paragraph, index) => (
        <P key={index}>{paragraph}</P>
      ))}
      {p.threadUrl ? <Cta href={p.threadUrl}>{t("support.reply.cta")}</Cta> : null}
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
