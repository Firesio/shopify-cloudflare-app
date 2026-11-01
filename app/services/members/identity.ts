/**
 * Who is opening the app, from what Shopify proved about the request. PURE.
 *
 * `sessionToken.sub` is the Shopify user the ID token was issued to; the library has already verified the token's
 * signature, audience and expiry, so this only reads it. With online tokens the session also carries the person's
 * profile (`onlineAccessInfo.associated_user`): the email is trusted only when Shopify says it is verified.
 */

/** The parts of the authenticated request this reads; the library's own types satisfy it structurally. */
export interface AuthenticatedRequest {
  readonly session: {
    readonly shop: string;
    readonly onlineAccessInfo?: {
      readonly associated_user: {
        readonly id: number;
        readonly email?: string;
        readonly email_verified?: boolean;
        readonly first_name?: string;
        readonly last_name?: string;
        readonly account_owner?: boolean;
        readonly collaborator?: boolean;
      };
    };
  };
  readonly sessionToken: { readonly sub?: string };
}

export interface MemberIdentity {
  readonly shop: string;
  /** Shopify's user id as text. Always the ID token's `sub`, so the same person is the same member however the request got here. */
  readonly shopifyUserId: string;
  /** Verified by Shopify, lower-cased; null when unknown or unverified. */
  readonly email: string | null;
  readonly name: string | null;
  readonly accountOwner: boolean;
  readonly collaborator: boolean;
}

/** Undefined when the token names no user: nothing can be linked to nobody. */
export function identityFromAuth(auth: AuthenticatedRequest): MemberIdentity | undefined {
  const shopifyUserId = auth.sessionToken.sub?.trim() ?? "";
  if (shopifyUserId === "") return undefined;

  const user = auth.session.onlineAccessInfo?.associated_user;
  const email = user?.email_verified === true && user.email !== undefined && user.email.trim() !== "" ? user.email.trim().toLowerCase() : null;
  const name = [user?.first_name, user?.last_name].map((part) => part?.trim() ?? "").filter((part) => part !== "").join(" ");
  return {
    shop: auth.session.shop,
    shopifyUserId,
    email,
    name: name === "" ? null : name,
    accountOwner: user?.account_owner === true,
    collaborator: user?.collaborator === true,
  };
}

/**
 * Do the ID token and the online profile name different users? They should not. Shopify documents `sub` as the user the
 * token was issued for and `associated_user.id` as the user's id, but does not say they are the same value, so the
 * guard reports a disagreement instead of assuming: if it ever fires, members would be keyed by two ids.
 */
export function userIdsDisagree(auth: AuthenticatedRequest): boolean {
  const online = auth.session.onlineAccessInfo?.associated_user.id;
  const sub = auth.sessionToken.sub?.trim() ?? "";
  return online !== undefined && sub !== "" && String(online) !== sub;
}
