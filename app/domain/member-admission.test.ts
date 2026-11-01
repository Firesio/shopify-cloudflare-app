import { describe, expect, it } from "vitest";
import { MEMBER_ROLES } from "./member-access";
import {
  UNKNOWN_USER,
  UNKNOWN_USER_POLICIES,
  decideAdmission,
  isUnknownUserPolicy,
  type AdmissionConfig,
  type AdmissionFacts,
  type UnknownUserPolicy,
} from "./member-admission";
import { MEMBER_STATUSES } from "./member-lifecycle";

const stranger: AdmissionFacts = { member: undefined, invite: undefined, isAccountOwner: false, shopHasOwner: true };
const config = (onUnknownUser: UnknownUserPolicy, autoJoinRole: AdmissionConfig["autoJoinRole"] = "member"): AdmissionConfig => ({ onUnknownUser, autoJoinRole });

describe("rules that never change", () => {
  it.each(UNKNOWN_USER_POLICIES)("lets a known active member in under %s", (policy) => {
    const facts = { ...stranger, member: { status: "active", role: "viewer" } } as const;
    expect(decideAdmission(facts, config(policy))).toEqual({ action: "allow" });
  });

  it.each(UNKNOWN_USER_POLICIES)("makes the first person on a store its owner under %s", (policy) => {
    expect(decideAdmission({ ...stranger, shopHasOwner: false }, config(policy))).toEqual({
      action: "create",
      role: "owner",
      status: "active",
      reason: "first_user",
    });
  });

  it.each(UNKNOWN_USER_POLICIES)("makes the Shopify account owner an owner under %s, even when the shop has one", (policy) => {
    expect(decideAdmission({ ...stranger, isAccountOwner: true }, config(policy))).toEqual({
      action: "create",
      role: "owner",
      status: "active",
      reason: "account_owner",
    });
  });

  it("calls the account owner who opens first the account owner, not the first user", () => {
    expect(decideAdmission({ ...stranger, isAccountOwner: true, shopHasOwner: false }, config("invite_only"))).toMatchObject({ reason: "account_owner" });
  });

  it.each(UNKNOWN_USER_POLICIES)("keeps out someone who was removed, however open %s is", (policy) => {
    const facts = { ...stranger, member: { status: "removed", role: "member" } } as const;
    expect(decideAdmission(facts, config(policy))).toEqual({ action: "deny", reason: "removed" });
  });

  it("keeps out a removed member even when an invitation is waiting for their email", () => {
    const facts = { ...stranger, member: { status: "removed", role: "member" }, invite: { role: "admin" } } as const;
    expect(decideAdmission(facts, config("auto_join"))).toEqual({ action: "deny", reason: "removed" });
  });

  it("keeps a pending member waiting", () => {
    const facts = { ...stranger, member: { status: "pending", role: "viewer" } } as const;
    expect(decideAdmission(facts, config("auto_join"))).toEqual({ action: "deny", reason: "pending" });
  });

  it.each(MEMBER_STATUSES.filter((status) => status !== "active"))("never locks the account owner out of their own store, even when their row is %s", (status) => {
    const facts = { ...stranger, isAccountOwner: true, member: { status, role: "viewer" } } as const;
    expect(decideAdmission(facts, config("invite_only"))).toEqual({ action: "restore_owner" });
  });

  it("restores an active account owner whose role was lowered", () => {
    const facts = { ...stranger, isAccountOwner: true, member: { status: "active", role: "member" } } as const;
    expect(decideAdmission(facts, config("invite_only"))).toEqual({ action: "restore_owner" });
  });

  it("leaves an active owner who is the account owner alone", () => {
    const facts = { ...stranger, isAccountOwner: true, member: { status: "active", role: "owner" } } as const;
    expect(decideAdmission(facts, config("invite_only"))).toEqual({ action: "allow" });
  });
});

describe("auto_join", () => {
  it("lets a stranger in with the default role", () => {
    expect(decideAdmission(stranger, config("auto_join", "viewer"))).toEqual({ action: "create", role: "viewer", status: "active", reason: "auto_join" });
  });

  it("uses whatever default role the app set", () => {
    for (const role of MEMBER_ROLES) {
      expect(decideAdmission(stranger, config("auto_join", role))).toMatchObject({ role });
    }
  });

  it("gives an invited person the role the invitation names, not the default", () => {
    expect(decideAdmission({ ...stranger, invite: { role: "admin" } }, config("auto_join", "viewer"))).toEqual({ action: "accept_invite", role: "admin" });
  });
});

describe("invite_only", () => {
  it("keeps a stranger out", () => {
    expect(decideAdmission(stranger, config("invite_only"))).toEqual({ action: "deny", reason: "not_invited" });
  });

  it("lets in someone with an invitation, with the invited role", () => {
    expect(decideAdmission({ ...stranger, invite: { role: "member" } }, config("invite_only"))).toEqual({ action: "accept_invite", role: "member" });
  });
});

describe("approval", () => {
  it("records a stranger as pending, with the least access", () => {
    expect(decideAdmission(stranger, config("approval", "admin"))).toEqual({ action: "create", role: "viewer", status: "pending", reason: "approval" });
  });

  it("lets in someone with an invitation without waiting", () => {
    expect(decideAdmission({ ...stranger, invite: { role: "member" } }, config("approval"))).toEqual({ action: "accept_invite", role: "member" });
  });
});

describe("the policy table", () => {
  it("has one decision for every policy and recognises exactly those", () => {
    for (const policy of UNKNOWN_USER_POLICIES) {
      expect(typeof UNKNOWN_USER[policy]).toBe("function");
      expect(isUnknownUserPolicy(policy)).toBe(true);
    }
    for (const value of ["", "open", "AUTO_JOIN", "__proto__", "toString"]) expect(isUnknownUserPolicy(value)).toBe(false);
  });

  it("never gives a stranger an owner role through a policy", () => {
    for (const policy of UNKNOWN_USER_POLICIES) {
      for (const invited of [undefined, { role: "viewer" as const }]) {
        const decision = decideAdmission({ ...stranger, invite: invited }, config(policy, "member"));
        if (decision.action === "create") expect(decision.role).not.toBe("owner");
      }
    }
  });
});
