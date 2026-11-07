import { presetOf, type MemberPermission } from "~/domain/member-access";
import type { AdmissionConfig } from "~/domain/member-admission";
import { FLOOR_PERMISSION } from "~/domain/member-permissions";
import { noticeHoursProblem, type SeatOverageConfig } from "~/domain/member-seat-overage";

/**
 * THE ONE PLACE an app decides how its members work, like `app/billing/plans.ts` is for plans. Change a value here and
 * nothing else; every rule that reads it is tested against each of its values.
 */
export interface MembersConfig extends AdmissionConfig {
  /**
   * Ask Shopify for an online access token, which carries the person's verified email, name and whether they own the
   * store. Without it the app knows only the Shopify user id: members show up unnamed, and `invite_only` cannot match
   * an invitation to the person who opens the app.
   */
  readonly onlineTokens: boolean;
  /**
   * What happens when a shop has more active members than its plan's seats (after a downgrade, or an owner admitted past
   * the limit). `never_remove` leaves the team alone; `notify_then_trim` tells the shop and, if it is still over when the
   * notice period ends, takes the extra people off their seats. Only meaningful when the plan limits seats at all
   * (`members.max` in the entitlement catalogue).
   */
  readonly seatOverage: SeatOverageConfig;
  /**
   * Whether merchants may give a member a set of permissions of their own instead of a role's preset. Off, the team page
   * offers roles only and nothing else is ever stored. On, a member's page lets an owner or admin choose each permission
   * (starting from a role's preset if they like); the member then holds exactly that set, and applying a role later
   * replaces it. `members:manage` is only ever given with the Owner or Admin role; `alsoProtected` adds permissions that,
   * in this app, only come with a role too (the plan, say).
   */
  readonly customPermissions: {
    readonly enabled: boolean;
    readonly alsoProtected: readonly MemberPermission[];
  };
}

export const MEMBERS: MembersConfig = {
  // A Shopify user who opens the app and is not a member yet:
  //   auto_join    becomes one, with `autoJoinRole`, and is in at once
  //   invite_only  is kept out unless a member invited their email
  //   approval     is recorded and waits until a member lets them in
  // The first person on a store is its admin and the Shopify account owner is always an owner, whichever you choose.
  onUnknownUser: "auto_join",
  autoJoinRole: "member",
  onlineTokens: true,
  // never_remove: a plan change removes nobody. For the other choice write
  //   seatOverage: { policy: "notify_then_trim", noticeHours: 72 }
  // (1 to 168 hours). Owners are never removed, and neither is the last person who can manage the team.
  seatOverage: { policy: "never_remove" },
  // false: roles only. For merchants who choose each person's permissions write
  //   customPermissions: { enabled: true, alsoProtected: ["billing:manage"] }
  // (`alsoProtected` is optional: the permissions that, here, come with a role and are never given one by one).
  customPermissions: { enabled: false, alsoProtected: [] },
};

/** What a role handed to people nobody chose must never carry: it would let a stranger change who has access or the plan. */
const NOT_FOR_STRANGERS: readonly MemberPermission[] = ["members:manage", "billing:manage"];

/** Things wrong with a configuration, in words. Empty when it is sound; a test holds the shipped one to that. */
export function memberConfigProblems(config: MembersConfig): readonly string[] {
  const problems: string[] = [];
  if (config.onUnknownUser === "invite_only" && !config.onlineTokens) {
    problems.push("invite_only needs onlineTokens: an invitation is matched to the person by their verified email.");
  }
  const sensitive = NOT_FOR_STRANGERS.filter((permission) => presetOf(config.autoJoinRole).includes(permission));
  if (sensitive.length > 0) {
    problems.push(`autoJoinRole "${config.autoJoinRole}" carries ${sensitive.join(", ")}, which a stranger must not get.`);
  }
  const notice = noticeHoursProblem(config.seatOverage);
  if (notice !== null) problems.push(notice);
  if (config.customPermissions.enabled && config.customPermissions.alsoProtected.includes(FLOOR_PERMISSION)) {
    problems.push(`customPermissions.alsoProtected must not include ${FLOOR_PERMISSION}: every set carries it, so no set could ever be given.`);
  }
  return problems;
}
