import type { MemberError, MemberSuccess } from "~/members/feedback";

/** Literal keys for every outcome, so one without words fails the build (@rules/i18n.md). */
export const SUCCESS_TEXT = {
  invited: "members.success.invited",
  roleChanged: "members.success.roleChanged",
  removed: "members.success.removed",
  invitationCancelled: "members.success.invitationCancelled",
  approved: "members.success.approved",
  restored: "members.success.restored",
} as const satisfies Record<MemberSuccess, string>;

export const ERROR_TEXT = {
  forbidden: "members.errors.forbidden",
  notFound: "members.errors.notFound",
  notYourself: "members.errors.notYourself",
  lastOwner: "members.errors.lastOwner",
  noSeat: "members.errors.noSeat",
  invalidState: "members.errors.invalidState",
  emailInvalid: "members.errors.emailInvalid",
  alreadyMember: "members.errors.alreadyMember",
  roleInvalid: "members.errors.roleInvalid",
  unknownIntent: "members.errors.unknownIntent",
} as const satisfies Record<MemberError, string>;
