import { useTranslation } from "react-i18next";
import type { MemberRole } from "~/domain/member-access";
import type { MemberDetail } from "~/domain/member-team";
import { ROLE_TEXT } from "./role-text";

interface AccessSectionProps {
  readonly member: Pick<MemberDetail, "role" | "custom" | "isYou" | "can">;
  /** The roles the person looking may hand out. */
  readonly roles: readonly MemberRole[];
  /** `intent:role` of the request in flight, so only the button that sent it shows progress. */
  readonly pending: string | undefined;
  /** A role was chosen. The page decides whether to ask first (a member with permissions of their own loses them). */
  readonly onChoose: (intent: "approve" | "restore" | "changeRole", role: MemberRole) => void;
}

/**
 * What the member is: their role and what it allows, or, if they have permissions of their own, that, and the role they
 * started from. And the roles the looker may apply. Choosing a role applies its preset, so a member with permissions of
 * their own is offered the role they started from too.
 */
export function AccessSection({ member, roles, pending, onChoose }: AccessSectionProps) {
  const { t } = useTranslation("admin");
  const { can } = member;
  const choices = (intent: "approve" | "restore" | "changeRole") =>
    roles
      .filter((role) => intent !== "changeRole" || member.custom || role !== member.role)
      .map((role) => (
        <s-button key={`${intent}-${role}`} loading={pending === `${intent}:${role}`} onClick={() => onChoose(intent, role)}>
          {t(`members.actions.${intent}`, { role: t(ROLE_TEXT[role].label) })}
        </s-button>
      ));
  const canAct = can.approve || can.restore || can.changeRole || can.remove;

  return (
    <s-section heading={t("members.detail.accessHeading")}>
      <s-stack gap="base">
        <s-stack gap="small-200">
          {member.custom ? (
            <>
              <s-text type="strong">{t("members.detail.customLabel")}</s-text>
              <s-paragraph color="subdued">{t("members.detail.basedOn", { role: t(ROLE_TEXT[member.role].label) })}</s-paragraph>
            </>
          ) : (
            <>
              <s-text type="strong">{t(ROLE_TEXT[member.role].label)}</s-text>
              <s-paragraph color="subdued">{t(ROLE_TEXT[member.role].description)}</s-paragraph>
            </>
          )}
        </s-stack>
        {(can.approve || can.restore || can.changeRole) && (
          <s-stack direction="inline" gap="small-200">
            {can.approve && choices("approve")}
            {can.restore && choices("restore")}
            {can.changeRole && choices("changeRole")}
          </s-stack>
        )}
        {!canAct && <s-paragraph>{member.isYou ? t("members.detail.isYou") : t("members.detail.notChangeable")}</s-paragraph>}
      </s-stack>
    </s-section>
  );
}
