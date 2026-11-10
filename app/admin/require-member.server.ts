import { data } from "react-router";
import { can, type MemberPermission } from "~/domain/member-access";
import type { TeamContact } from "~/domain/member-team";
import { isAccessRefusal, type AccessRefusal } from "~/domain/member-admission";
import { parseRefusalContacts } from "~/admin/route-error";
import { authenticateAdmin } from "~/admin/require-merchant.server";
import { requestMemo } from "~/request-context.server";
import type { Member } from "~/ports/members";
import { contactsToAsk, identityFromAuth, resolveMember, userIdsDisagree, type AuthenticatedRequest, type MemberAccess, type MemberIdentity } from "~/services/members.server";
import { memberDependencies } from "~/wiring.server";
import { shopLog } from "~/observability/shop-log";

/**
 * The guard for every embedded route: Shopify has proved who is asking (`authenticateAdmin`), and this decides whether
 * that person may do THIS. Routes call it instead of `authenticateAdmin` and get everything it returns, plus `member`.
 *
 *   not a member, or kept out    403 with the reason, which the app's error boundary turns into a page that says why
 *   a member without permission  403 with reason `forbidden`
 *   no user in the token         401 with the retry header, so App Bridge fetches a fresh token and asks again
 *
 * The server is the lock. A page also hides what a member cannot use, but only to be kind.
 */
export interface MemberGuardDependencies<A extends AuthenticatedRequest> {
  readonly authenticate: (request: Request) => Promise<A>;
  readonly resolve: (identity: MemberIdentity) => Promise<MemberAccess>;
  /** Told when the ID token and the online profile name different users (see `userIdsDisagree`). */
  readonly onUserIdMismatch: (shop: string) => void | Promise<void>;
  /**
   * Who a kept-out person can ask, read only when a refusal is thrown so that the page which explains it (the layout's
   * error boundary cannot run server code) can name them. Absent: the refusal carries no contacts.
   */
  readonly contacts?: (shop: string) => Promise<readonly TeamContact[]>;
}

export type GuardedRequest<A> = A & { readonly member: Member };

/**
 * The body carries the shop (the person's own, already in their address bar) and who to ask, so the one page that
 * explains a refusal can name them even when it is rendered by an error boundary.
 */
async function refuse(reason: AccessRefusal, shop: string, deps: Pick<MemberGuardDependencies<never>, "contacts">): Promise<never> {
  if (!deps.contacts) throw data({ reason, shop }, { status: 403 });
  throw data({ reason, shop, contacts: await deps.contacts(shop) }, { status: 403 });
}

export async function requireMember<A extends AuthenticatedRequest>(
  request: Request,
  permission: MemberPermission,
  deps: MemberGuardDependencies<A>,
): Promise<GuardedRequest<A>> {
  const auth = await deps.authenticate(request);
  const identity = identityFromAuth(auth);
  if (!identity) {
    throw new Response("Unauthorized", { status: 401, headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" } });
  }
  // The layout and its page each run this guard: the disagreement is one fact about the request, so it is told once.
  if (userIdsDisagree(auth)) {
    await requestMemo(`member-id-mismatch:${identity.shop}:${identity.shopifyUserId}`, async () => deps.onUserIdMismatch(identity.shop));
  }

  // The layout and its page both ask in one request, and several requests can run together: one lookup per person.
  const access = await requestMemo(`member:${identity.shop}:${identity.shopifyUserId}`, () => deps.resolve(identity));
  if (!access.ok) return refuse(access.reason, identity.shop, deps);
  if (!can(access.member, permission)) return refuse("forbidden", identity.shop, deps);
  return { ...auth, member: access.member };
}

/**
 * The reason and shop of a refusal this guard threw, or undefined for anything else (the library's own responses, a real
 * failure). For the one caller that turns a refusal into a page instead of letting it propagate: the layout.
 */
export function accessRefusalOf(thrown: unknown): { readonly reason: AccessRefusal; readonly shop: string; readonly contacts?: readonly TeamContact[] | undefined } | undefined {
  if (typeof thrown !== "object" || thrown === null || !("data" in thrown) || !("init" in thrown)) return undefined;
  const { data: body, init } = thrown;
  const status = typeof init === "object" && init !== null && "status" in init ? init.status : undefined;
  if (status !== 403 || typeof body !== "object" || body === null) return undefined;
  const reason = "reason" in body ? body.reason : undefined;
  const shop = "shop" in body ? body.shop : undefined;
  if (!isAccessRefusal(reason) || typeof shop !== "string" || shop === "") return undefined;
  return { reason, shop, contacts: "contacts" in body ? parseRefusalContacts(body.contacts) : undefined };
}

/** Contacts are a courtesy on a refusal page: not being able to read them must not turn a refusal into a failure. */
async function contactsOrNone(shop: string): Promise<readonly TeamContact[]> {
  try {
    return await contactsToAsk(shop, memberDependencies());
  } catch (error) {
    await shopLog("member.contacts_unavailable", shop, { errorName: error instanceof Error ? error.name : typeof error });
    return [];
  }
}

/** The guard as routes use it: the real authentication, the real members, the app's own configuration. */
export function guardMember(request: Request, permission: MemberPermission) {
  return requireMember(request, permission, {
    authenticate: authenticateAdmin,
    resolve: (identity) => resolveMember(identity, memberDependencies()),
    onUserIdMismatch: (shop) => shopLog("member.user_id_mismatch", shop),
    contacts: contactsOrNone,
  });
}
