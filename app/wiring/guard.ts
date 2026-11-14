import { data, redirect } from "react-router";
import { can, identityFromAuth, resolveMember, userIdsDisagree, type AccessRefusal, type PlatformUser } from "@firesio/members";
import { MEMBERS, type AppMember, type Permission } from "~/core/members";
import type { PlanHandle } from "~/core/plans";
import { isSafeHostParameter } from "~/core/shopify-host";
import { services } from "./services";
import { shopify } from "./shopify";

/**
 * `authenticate.admin` for every embedded entry. Shopify's host sanitiser throws on a malformed `host` parameter, which would
 * surface as a 500; that is the caller's mistake, so it is answered 400 first. Every other outcome, including the library's own
 * redirect and 401 Responses, passes through untouched.
 */
export async function authenticateAdmin(request: Request) {
  const host = new URL(request.url).searchParams.get("host");
  if (host !== null && !isSafeHostParameter(host)) throw new Response("Invalid host parameter", { status: 400 });
  return shopify().authenticate.admin(request);
}

type Authenticated = Awaited<ReturnType<typeof authenticateAdmin>>;

const NO_ACCESS = "/app/no-access";

function profileOf(auth: Authenticated): PlatformUser | undefined {
  const user = auth.session.onlineAccessInfo?.associated_user;
  if (user === undefined) return undefined;
  const displayName = [user.first_name, user.last_name].filter((part) => typeof part === "string" && part.trim() !== "").join(" ");
  return { email: user.email ?? null, emailVerified: user.email_verified === true, displayName, accountOwner: user.account_owner === true, collaborator: user.collaborator === true };
}

export interface GuardedRequest {
  readonly auth: Authenticated;
  readonly shop: string;
  readonly member: AppMember;
}

/** Why a person is kept out, or the member. Never throws for "not allowed": that is a page, not an error. */
export async function admit(request: Request): Promise<{ readonly auth: Authenticated; readonly shop: string; readonly access: { readonly ok: true; readonly member: AppMember } | { readonly ok: false; readonly reason: AccessRefusal | "unavailable" } }> {
  const auth = await authenticateAdmin(request);
  const identity = identityFromAuth(auth);
  if (identity === undefined) throw new Response("Unauthorized", { status: 401, headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" } });
  const s = services();
  if (userIdsDisagree(auth)) s.log({ event: "member.user_id_mismatch" });
  const profile = profileOf(auth);
  const access = await resolveMember(
    { account: identity.account, shopifyUserId: identity.shopifyUserId, ...(profile === undefined ? {} : { profile }) },
    { members: s.members, config: MEMBERS, seats: s.seats, runtime: { clock: { now: s.runtime.now }, ids: { uuid: s.runtime.uuid } }, log: s.log },
  );
  return { auth, shop: identity.account, access };
}

/**
 * The guard for every embedded route: Shopify has proved who is asking (`authenticateAdmin`), and this decides whether that person
 * may do THIS. A person kept out is sent to the page that says why (`/app/no-access`); a member without the permission is
 * answered 403. A blocked shop (the portal asked, `AdminApi.shops().blockAccount`) sees a page saying so. The server is the lock:
 * a page also hides what a member cannot use, but only to be kind.
 */
export async function guardMember(request: Request, permission: Permission): Promise<GuardedRequest> {
  const { auth, shop, access } = await admit(request);
  const record = await services().shops.get(shop);
  const blocked = record?.blockedAt !== null && record?.blockedAt !== undefined;
  // Two ways to be blocked: the portal asked this app (AdminApi, the `shops.blocked_at` column), or the portal's KV kill switch says so.
  if (blocked || (await services().blocklist.shopBlocked(shop))) throw data({ reason: "blocked" }, { status: 403 });
  if (!access.ok) throw redirect(`${NO_ACCESS}${new URL(request.url).search}`);
  if (!can(access.member, permission, MEMBERS)) throw data({ reason: "forbidden" }, { status: 403 });
  return { auth, shop, member: access.member };
}

export const effectivePlanOf = async (shop: string): Promise<PlanHandle> => {
  const plan = await services().billing.effectivePlan(shop);
  return plan.ok ? plan.effective.planHandle : "free";
};
