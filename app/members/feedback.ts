import type { InviteFailure, ManageFailure } from "~/services/members.server";

/**
 * What the members page tells someone after they act. A closed vocabulary, so every outcome has words in the `admin`
 * catalogue (`members.success.*`, `members.errors.*`) and a new one fails the build where the page maps it to a key.
 * Client-safe: types and a guard only.
 */
export const MEMBER_SUCCESSES = ["invited", "roleChanged", "removed", "invitationCancelled", "approved", "restored"] as const;
export type MemberSuccess = (typeof MEMBER_SUCCESSES)[number];

export type MemberError = ManageFailure | InviteFailure | "roleInvalid" | "unknownIntent";

export type MemberActionResult = { readonly success: MemberSuccess } | { readonly error: MemberError };
