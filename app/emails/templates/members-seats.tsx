import type { AudienceText } from "~/i18n/audience";
import { formatDateTime, formatList } from "~/i18n/format";
import type { UnitKeys } from "~/i18n/text-units";
import type { MembersSeatsTrimmedPayload, MembersSeatTrimNoticePayload, SeatNoticePerson } from "~/notifications/payloads";
import { Cta, EmailLayout, Muted, P } from "../layout";
import { renderEmail, type RenderedEmail } from "../render";

type SeatsText = AudienceText<UnitKeys<"email.members-seats">>;

/** Who a person is to the reader: their name, else their address, else the words for "a staff member without a name". */
function label(person: SeatNoticePerson, text: SeatsText): string {
  return person.name ?? person.email ?? text.fixedT("email")("members.unnamed");
}

/**
 * Merchant-facing, to the people who manage a shop's team: the plan has fewer seats than the team has people, and unless
 * that is fixed by the deadline the people listed lose their seat. Names the deadline in the reader's language and the
 * shop's own time zone (the payload carries the instant and the zone, because only the renderer knows the language).
 */
export function membersSeatTrimNoticeEmail(p: MembersSeatTrimNoticePayload, text: SeatsText): Promise<RenderedEmail> {
  const t = text.fixedT("email");
  const subject = t("members.seatNotice.subject");
  const deadline = formatDateTime(text.language.code, p.deadlineAt, p.timeZone);
  const people = formatList(text.language.code, p.people.map((person) => label(person, text)));
  return renderEmail(
    subject,
    <EmailLayout preview={subject} heading={subject} logoUrl={p.logoUrl} text={text}>
      <P>{t("members.seatNotice.greeting", { name: p.recipientName })}</P>
      <P>{t("members.seatNotice.intro", { shopName: p.shopName, limit: p.limit, used: p.used })}</P>
      <P>{t("members.seatNotice.who", { deadline, people })}</P>
      {p.morePeople > 0 ? <P>{t("members.seatNotice.more", { count: p.morePeople })}</P> : null}
      <P>{t("members.seatNotice.action")}</P>
      <Cta href={p.teamUrl} text={text}>{t("members.seatNotice.cta")}</Cta>
      <P>{t("members.seatNotice.plan")} {p.planUrl}</P>
      <Muted>{t("members.seatNotice.footer", { shopName: p.shopName })}</Muted>
    </EmailLayout>,
  );
}

/** Merchant-facing: the deadline passed and these people lost their seat. Says how they are let back in. */
export function membersSeatsTrimmedEmail(p: MembersSeatsTrimmedPayload, text: SeatsText): Promise<RenderedEmail> {
  const t = text.fixedT("email");
  const subject = t("members.seatsTrimmed.subject");
  const people = formatList(text.language.code, p.people.map((person) => label(person, text)));
  return renderEmail(
    subject,
    <EmailLayout preview={subject} heading={subject} logoUrl={p.logoUrl} text={text}>
      <P>{t("members.seatsTrimmed.greeting", { name: p.recipientName })}</P>
      <P>{t("members.seatsTrimmed.intro", { shopName: p.shopName, limit: p.limit })}</P>
      <P>{t("members.seatsTrimmed.who", { people })}</P>
      {p.morePeople > 0 ? <P>{t("members.seatsTrimmed.more", { count: p.morePeople })}</P> : null}
      <P>{t("members.seatsTrimmed.restore")}</P>
      <Cta href={p.teamUrl} text={text}>{t("members.seatsTrimmed.cta")}</Cta>
      <P>{t("members.seatsTrimmed.plan")} {p.planUrl}</P>
      <Muted>{t("members.seatsTrimmed.footer", { shopName: p.shopName })}</Muted>
    </EmailLayout>,
  );
}
