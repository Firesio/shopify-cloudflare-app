import { useTranslation } from "react-i18next";
import type { MemberDetail } from "~/domain/member-team";
import { formatDateTime } from "~/i18n/format";
import { useLanguage } from "~/i18n/useLanguage";
import { useTimeZone } from "~/i18n/useTimeZone";
import { useDisplayName } from "./member-display";

function Fact({ label, children }: { readonly label: string; readonly children: string }) {
  return (
    <s-stack gap="small-200">
      <s-text color="subdued">{label}</s-text>
      <s-text>{children}</s-text>
    </s-stack>
  );
}

/** The dates and the inviter of one member: the supporting facts, for the page's aside. */
export function MemberFacts({ member }: { readonly member: Pick<MemberDetail, "createdAt" | "lastSeenAt" | "invitedBy"> }) {
  const { t } = useTranslation("admin");
  const language = useLanguage();
  const timeZone = useTimeZone();
  const nameOf = useDisplayName();
  return (
    <s-section heading={t("members.detail.asideHeading")}>
      <s-stack gap="base">
        <Fact label={t("members.detail.added")}>{formatDateTime(language, member.createdAt, timeZone)}</Fact>
        <Fact label={t("members.table.lastSeen")}>{member.lastSeenAt === null ? t("members.table.never") : formatDateTime(language, member.lastSeenAt, timeZone)}</Fact>
        {member.invitedBy !== null && <Fact label={t("members.detail.invitedBy")}>{nameOf({ ...member.invitedBy, isInvitation: false })}</Fact>}
      </s-stack>
    </s-section>
  );
}
