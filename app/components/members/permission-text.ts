import type { MemberPermission } from "~/domain/member-access";

/**
 * The catalogue key of each permission's name and what it allows, as literals: `t()` is typed against the `en` files, so a
 * permission added to the registry without words fails the build here instead of showing a raw key to a merchant
 * (@rules/i18n.md). An app that adds a permission names it here and in the `admin` catalogue, in every language. The keys carry
 * no colon: i18next reads one as the namespace separator.
 */
export const PERMISSION_TEXT = {
  "app:view": { label: "members.permissions.appView.label", description: "members.permissions.appView.description" },
  "app:manage": { label: "members.permissions.appManage.label", description: "members.permissions.appManage.description" },
  "billing:manage": { label: "members.permissions.billingManage.label", description: "members.permissions.billingManage.description" },
  "members:manage": { label: "members.permissions.membersManage.label", description: "members.permissions.membersManage.description" },
} as const satisfies Record<MemberPermission, { readonly label: string; readonly description: string }>;
