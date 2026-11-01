import type { MemberRole } from "~/domain/member-access";

/**
 * The catalogue key of each role's name and what it allows, as literals: `t()` is typed against the `en` files, so a role
 * added to the registry without words fails the build here instead of showing a raw key to a merchant (@rules/i18n.md).
 */
export const ROLE_TEXT = {
  owner: { label: "members.roles.owner.label", description: "members.roles.owner.description" },
  admin: { label: "members.roles.admin.label", description: "members.roles.admin.description" },
  member: { label: "members.roles.member.label", description: "members.roles.member.description" },
  viewer: { label: "members.roles.viewer.label", description: "members.roles.viewer.description" },
} as const satisfies Record<MemberRole, { readonly label: string; readonly description: string }>;
