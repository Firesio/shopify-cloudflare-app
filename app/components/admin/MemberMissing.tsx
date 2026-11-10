import { useTranslation } from "react-i18next";

/**
 * A person's page whose person is no longer on this shop's team (removed in another tab, a stale link): said plainly,
 * with the way back, instead of the generic failure page.
 */
export function MemberMissing() {
  const { t } = useTranslation("admin");
  const heading = t("members.errors.notFound");
  return (
    <s-page heading={t("nav.members")} inlineSize="base">
      <s-link slot="breadcrumb-actions" href="/app/members">
        {t("nav.members")}
      </s-link>
      <s-section accessibilityLabel={heading}>
        <s-empty-state heading={heading}>
          <s-icon slot="graphic" type="person"></s-icon>
          <s-button slot="primary-action" variant="primary" href="/app/members">
            {t("shell.memberMissing.back")}
          </s-button>
        </s-empty-state>
      </s-section>
    </s-page>
  );
}
