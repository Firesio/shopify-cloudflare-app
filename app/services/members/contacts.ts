import { rolesHolding } from "~/domain/member-access";
import { contactsOf, type TeamContact } from "~/domain/member-team";
import type { MemberStore } from "~/ports/members";

/** Wide enough that the few shown are the right ones even when the shop has several admins. */
const CANDIDATES = 10;

/**
 * Who a person who is kept out can ask to be let in: the shop's active owners and admins (everyone who may manage the
 * team), by name and address. Read only for that screen, so no ordinary page pays for it.
 */
export async function contactsToAsk(shop: string, deps: { readonly members: MemberStore }): Promise<readonly TeamContact[]> {
  const managers = await deps.members.listWithRoles(shop, rolesHolding("members:manage"), CANDIDATES);
  return contactsOf(managers);
}
