/** Facade: callers import from here; the use cases live in `services/members/`. */
export { identityFromAuth, userIdsDisagree, type AuthenticatedRequest, type MemberIdentity } from "./members/identity";
export { contactsToAsk } from "./members/contacts";
export { inviteMember, type InviteFailure } from "./members/invite-member";
export {
  approveMember,
  changeRole,
  removeMember,
  restoreMember,
  type Actor,
  type ManageDependencies,
  type ManageFailure,
} from "./members/manage-members";
export { resolveMember, SEEN_REFRESH_MS, type MemberAccess, type MemberDependencies, type MemberLogEntry } from "./members/resolve-member";
