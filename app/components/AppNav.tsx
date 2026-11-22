import type { Permission } from "~/core/members";
import type { NavLabels } from "~/i18n/labels";

/**
 * The embedded app's navigation menu. A link the person cannot open is not offered; each page checks the permission itself,
 * so hiding is only courtesy. The permissions are the app's own (`app/core/members.ts`), so a typo here does not compile. The words are the catalogue's
 * (`navLabelsOf`, built by the layout's loader in the language of the request).
 */
export function AppNav({ permissions, labels }: { readonly permissions: readonly Permission[]; readonly labels: NavLabels }) {
  const can = (permission: Permission) => permissions.includes(permission);
  return (
    <s-app-nav>
      <s-link href="/app" rel="home">{labels.home}</s-link>
      <s-link href="/app/support">{labels.support}</s-link>
      {can("billing:manage") ? <s-link href="/app/plans">{labels.plan}</s-link> : null}
      {can("members:manage") ? <s-link href="/app/members">{labels.team}</s-link> : null}
      {can("app:manage") ? <s-link href="/app/settings">{labels.settings}</s-link> : null}
    </s-app-nav>
  );
}
