import { describe, expect, it } from "vitest";
import { identityFromAuth, userIdsDisagree, type AuthenticatedRequest } from "./identity";

const NO_USER = "no-user-sentinel" as const;
const auth = (overrides: Partial<AuthenticatedRequest["session"]> = {}, sub = "42"): AuthenticatedRequest => ({
  session: { shop: "alpha.myshopify.com", ...overrides },
  sessionToken: sub === NO_USER ? {} : { sub },
});
const online = (user: Partial<NonNullable<AuthenticatedRequest["session"]["onlineAccessInfo"]>["associated_user"]> = {}) => ({
  onlineAccessInfo: { associated_user: { id: 42, email: "Ada@Firesio.app", email_verified: true, first_name: "Ada", last_name: "Lovelace", account_owner: true, collaborator: false, ...user } },
});

describe("identityFromAuth", () => {
  it("is the ID token's user, and nothing more known, without an online profile", () => {
    expect(identityFromAuth(auth())).toEqual({ shop: "alpha.myshopify.com", shopifyUserId: "42", email: null, name: null, accountOwner: false, collaborator: false });
  });

  it("reads the profile from an online session, lower-casing the verified email", () => {
    expect(identityFromAuth(auth(online()))).toEqual({
      shop: "alpha.myshopify.com",
      shopifyUserId: "42",
      email: "ada@firesio.app",
      name: "Ada Lovelace",
      accountOwner: true,
      collaborator: false,
    });
  });

  it("never trusts an email Shopify has not verified", () => {
    expect(identityFromAuth(auth(online({ email_verified: false })))?.email).toBeNull();
    expect(identityFromAuth(auth(online({ email_verified: undefined })))?.email).toBeNull();
  });

  it.each(["", "   "])("treats the email %j as none", (email) => {
    expect(identityFromAuth(auth(online({ email })))?.email).toBeNull();
  });

  it("builds the name from whichever parts exist", () => {
    expect(identityFromAuth(auth(online({ last_name: "" })))?.name).toBe("Ada");
    expect(identityFromAuth(auth(online({ first_name: undefined, last_name: "Lovelace" })))?.name).toBe("Lovelace");
    expect(identityFromAuth(auth(online({ first_name: "", last_name: "" })))?.name).toBeNull();
  });

  it("carries the collaborator flag", () => {
    expect(identityFromAuth(auth(online({ collaborator: true, account_owner: false })))).toMatchObject({ collaborator: true, accountOwner: false });
  });

  it("is keyed by the ID token's user even when the online profile says another number", () => {
    expect(identityFromAuth(auth(online({ id: 99 })))?.shopifyUserId).toBe("42");
  });

  it.each([NO_USER, "", "  "])("is nobody when the token names no user (%j)", (sub) => {
    expect(identityFromAuth(auth({}, sub))).toBeUndefined();
  });
});

describe("userIdsDisagree", () => {
  it("is false when both name the same user, whatever the type", () => {
    expect(userIdsDisagree(auth(online({ id: 42 })))).toBe(false);
  });

  it("is true when they name different users", () => {
    expect(userIdsDisagree(auth(online({ id: 7 })))).toBe(true);
  });

  it("is false when there is nothing to compare", () => {
    expect(userIdsDisagree(auth())).toBe(false);
    expect(userIdsDisagree(auth(online(), NO_USER))).toBe(false);
  });
});
