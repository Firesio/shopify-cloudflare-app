import { defineMembers, type Member, type MembersConfig } from "@firesio/members";

/**
 * THE ONE PLACE an app decides how its members work (`@firesio/members`): the permissions, the roles (most privileged
 * first: that order is the hierarchy) and the policies. Role and permission names are inferred from this, so a typo
 * elsewhere does not compile. `memberConfigProblems(MEMBERS)` is held to none by a test.
 */
const PERMISSIONS = ["app:view", "app:manage", "billing:manage", "members:manage"] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const MEMBERS = defineMembers({
  permissions: PERMISSIONS,
  roles: {
    owner: "all",
    admin: "all",
    member: ["app:view", "app:manage"],
    viewer: ["app:view"],
  },
  ownerRole: "owner",
  firstUserRole: "admin",
  managePermission: "members:manage",
  floorPermission: "app:view",
  // A Shopify user who opens the app and is not a member yet: `auto_join` | `invite_only` | `approval`.
  onUnknownUser: "auto_join",
  autoJoinRole: "member",
  notForStrangers: ["billing:manage"],
  // Online tokens carry the verified email, name and whether the person owns the store.
  onlineTokens: true,
  // `never_remove`: a plan change removes nobody. For the other choice: { policy: "notify_then_trim", noticeHours: 72 }.
  seatOverage: { policy: "never_remove" },
  customPermissions: { enabled: false, alsoProtected: [] },
});

type MemberOf<C> = C extends MembersConfig<infer R, infer P> ? Member<R, P> : never;

/** A member as this app's `defineMembers` types it: its own role and permission names, so a typo does not compile. */
export type AppMember = MemberOf<typeof MEMBERS>;
