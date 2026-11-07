import { useTranslation } from "react-i18next";
import type { MemberDetail } from "~/domain/member-team";
import { StatusBadge } from "./member-display";

/** Who this is: where they stand, what Shopify says of them, and their address. */
export function ProfileSection({ member }: { readonly member: Pick<MemberDetail, "status" | "noSeat" | "isYou" | "accountOwner" | "collaborator" | "email"> }) {
  const { t } = useTranslation("admin");
  return (
    <s-section heading={t("members.detail.profile")}>
      <s-stack gap="small-200">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <StatusBadge row={member} />
          {member.isYou && <s-badge>{t("members.table.you")}</s-badge>}
          {member.accountOwner && <s-badge tone="info">{t("members.table.storeOwner")}</s-badge>}
          {member.collaborator && <s-badge>{t("members.detail.collaborator")}</s-badge>}
        </s-stack>
        <s-text color="subdued">{member.email ?? t("members.detail.noEmail")}</s-text>
      </s-stack>
    </s-section>
  );
}
