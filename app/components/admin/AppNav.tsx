import { useTranslation } from "react-i18next";
import { makeAccess } from "~/admin/access";
import type { MemberPermission } from "~/domain/member-access";

/**
 * The embedded app's navigation menu. A link the person cannot open is not offered; each page checks the permission
 * itself, so hiding is only courtesy. Rendered by the layout for every page and by its error boundary, so a refusal or a
 * missing record never leaves the person without a way around the app.
 */
export function AppNav({ permissions }: { readonly permissions: readonly MemberPermission[] }) {
  const { t } = useTranslation("admin");
  const allowed = makeAccess(permissions);
  return (
    <s-app-nav>
      <s-link href="/app" rel="home">{t("nav.home")}</s-link>
      {allowed.can("billing:manage") ? <s-link href="/app/billing">{t("nav.billing")}</s-link> : null}
      {allowed.can("members:manage") ? <s-link href="/app/members">{t("nav.members")}</s-link> : null}
      <s-link href="/app/support">{t("nav.support")}</s-link>
    </s-app-nav>
  );
}
