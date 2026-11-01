import { can, canAssignRole, type MemberRole } from "~/domain/member-access";
import { err, ok, type Result } from "~/lib/result";
import type { Member, MemberStore } from "~/ports/members";
import type { Runtime } from "~/ports/runtime";

export type InviteFailure = "forbidden" | "emailInvalid" | "alreadyMember";

/** Deliberately permissive: the real check is whether the person can open the app with that address. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * A member asks for someone by email, with a role. The person becomes a member the first time they open the app with
 * that address verified by Shopify (`resolveMember` matches it).
 *
 * The inviter must be allowed to manage members AND to hand out the role: nobody can invite above themselves. An
 * address that already belongs to a member, or to an open invitation, is refused rather than duplicated.
 */
export async function inviteMember(
  input: { readonly actor: Pick<Member, "id" | "shop" | "role">; readonly email: string; readonly role: MemberRole },
  deps: { readonly members: MemberStore; readonly runtime: Pick<Runtime, "clock" | "ids"> },
): Promise<Result<Member, InviteFailure>> {
  if (!can(input.actor.role, "members:manage") || !canAssignRole(input.actor.role, input.role)) return err("forbidden");

  const email = input.email.trim().toLowerCase();
  if (!looksLikeEmail(email)) return err("emailInvalid");
  if (await deps.members.findOpenByEmail(input.actor.shop, email)) return err("alreadyMember");

  const invitation = await deps.members.createInvite(input.actor.shop, {
    id: deps.runtime.ids.uuid(),
    email,
    role: input.role,
    invitedBy: input.actor.id,
    now: deps.runtime.clock.now(),
  });
  return ok(invitation);
}
