import { permissionsOf, type MemberPermission } from "~/domain/member-access";
import type { AdmissionConfig } from "~/domain/member-admission";

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
}

export const MEMBERS: MembersConfig = {
  // A Shopify user who opens the app and is not a member yet:
  //   auto_join    becomes one, with `autoJoinRole`, and is in at once
  //   invite_only  is kept out unless a member invited their email
  //   approval     is recorded and waits until a member lets them in
  // The installer is always the first member, an owner, whichever you choose.
  onUnknownUser: "auto_join",
  autoJoinRole: "member",
  onlineTokens: true,
};

/** What a role handed to people nobody chose must never carry: it would let a stranger change who has access or the plan. */
const NOT_FOR_STRANGERS: readonly MemberPermission[] = ["members:manage", "billing:manage"];

/** Things wrong with a configuration, in words. Empty when it is sound; a test holds the shipped one to that. */
export function memberConfigProblems(config: MembersConfig): readonly string[] {
  const problems: string[] = [];
  if (config.onUnknownUser === "invite_only" && !config.onlineTokens) {
    problems.push("invite_only needs onlineTokens: an invitation is matched to the person by their verified email.");
  }
  const sensitive = NOT_FOR_STRANGERS.filter((permission) => permissionsOf(config.autoJoinRole).includes(permission));
  if (sensitive.length > 0) {
    problems.push(`autoJoinRole "${config.autoJoinRole}" carries ${sensitive.join(", ")}, which a stranger must not get.`);
  }
  return problems;
}
