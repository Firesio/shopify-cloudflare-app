import type { MemberDetail } from "~/domain/member-team";

/**
 * One member's page data as the loader gives it, for tests of the page: an active member on the `member` role, who has
 * not been given permissions of their own, and whom the person looking may change and remove. Override what a test is about.
 */
export function memberDetailFixture(overrides: Partial<MemberDetail> & Pick<MemberDetail, "id">): MemberDetail {
  return {
    name: "Mia",
    email: "mia@firesio.app",
    role: "member",
    status: "active",
    isYou: false,
    accountOwner: false,
    isInvitation: false,
    noSeat: false,
    lastSeenAt: Date.UTC(2026, 10, 1, 9, 30),
    collaborator: false,
    createdAt: Date.UTC(2026, 9, 20, 8, 0),
    invitedBy: null,
    custom: false,
    permissions: ["app:view", "app:manage"],
    customize: { allowed: false, grantable: ["app:view", "app:manage", "billing:manage"] },
    can: { changeRole: true, remove: true, approve: false, restore: false },
    seat: null,
    ...overrides,
  };
}
