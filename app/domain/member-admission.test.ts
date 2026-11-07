import { describe, expect, it } from "vitest";
import { MEMBER_ROLES } from "./member-access";
import {
  FIRST_USER_ROLE,
  UNKNOWN_USER,
  UNKNOWN_USER_POLICIES,
  decideAdmission,
  isUnknownUserPolicy,
  type AdmissionConfig,
  type AdmissionFacts,
  type UnknownUserPolicy,
} from "./member-admission";
import { MEMBER_STATUSES } from "./member-lifecycle";

const stranger: AdmissionFacts = { member: undefined, invite: undefined, isAccountOwner: false, isCollaborator: false, appWasOpened: true };
const firstVisitor: AdmissionFacts = { ...stranger, appWasOpened: false };
const config = (onUnknownUser: UnknownUserPolicy, autoJoinRole: AdmissionConfig["autoJoinRole"] = "member"): AdmissionConfig => ({ onUnknownUser, autoJoinRole });

describe("rules that never change", () => {
  it.each(UNKNOWN_USER_POLICIES)("lets a known active member in under %s", (policy) => {
    const facts = { ...stranger, member: { status: "active", role: "viewer", trimmed: false } } as const;
    expect(decideAdmission(facts, config(policy))).toEqual({ action: "allow" });
  });

  it("gives the first person on a store the admin role: everything, but not an owner", () => {
    expect(FIRST_USER_ROLE).toBe("admin");
  });

  it.each(UNKNOWN_USER_POLICIES)("makes the first person on a store an active admin under %s", (policy) => {
    expect(decideAdmission(firstVisitor, config(policy))).toEqual({
      action: "create",
      role: "admin",
      status: "active",
      reason: "first_user",
    });
  });

  it.each(UNKNOWN_USER_POLICIES)("ignores the policy's default role for the first person under %s", (policy) => {
    expect(decideAdmission(firstVisitor, config(policy, "viewer"))).toMatchObject({ role: "admin" });
  });

  it.each(UNKNOWN_USER_POLICIES)("never makes someone an owner for being first under %s", (policy) => {
    for (const appWasOpened of [true, false]) {
      const decision = decideAdmission({ ...stranger, appWasOpened }, config(policy));
      if (decision.action === "create") expect(decision.role).not.toBe("owner");
    }
  });

  it.each(UNKNOWN_USER_POLICIES)("does not repeat the first-user rule once someone has opened the app, under %s", (policy) => {
    expect(decideAdmission(stranger, config(policy))).not.toMatchObject({ reason: "first_user" });
  });

  it("sends the first collaborator through the app's policy, not to admin", () => {
    const collaborator = { ...firstVisitor, isCollaborator: true };
    expect(decideAdmission(collaborator, config("auto_join", "viewer"))).toEqual({ action: "create", role: "viewer", status: "active", reason: "auto_join" });
    expect(decideAdmission(collaborator, config("invite_only"))).toEqual({ action: "deny", reason: "not_invited" });
    expect(decideAdmission(collaborator, config("approval"))).toEqual({ action: "create", role: "viewer", status: "pending", reason: "approval" });
  });

  it("lets an invited first collaborator take up the invitation", () => {
    expect(decideAdmission({ ...firstVisitor, isCollaborator: true, invite: { role: "member" } }, config("invite_only"))).toEqual({ action: "accept_invite", role: "member" });
  });

  it("never makes a collaborator an owner or admin, opened or not, under any policy", () => {
    for (const policy of UNKNOWN_USER_POLICIES) {
      for (const appWasOpened of [true, false]) {
        const decision = decideAdmission({ ...stranger, isCollaborator: true, appWasOpened }, config(policy, "member"));
        if (decision.action === "create") expect(["owner", "admin"]).not.toContain(decision.role);
      }
    }
  });

  it("lets Shopify's own signal win when the account owner is also flagged a collaborator", () => {
    expect(decideAdmission({ ...firstVisitor, isAccountOwner: true, isCollaborator: true }, config("invite_only"))).toEqual({
      action: "create",
      role: "owner",
      status: "active",
      reason: "account_owner",
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
    expect(decideAdmission({ ...firstVisitor, isAccountOwner: true }, config("invite_only"))).toMatchObject({ reason: "account_owner" });
  });

  it.each(UNKNOWN_USER_POLICIES)("keeps out someone who was removed, however open %s is", (policy) => {
    const facts = { ...stranger, member: { status: "removed", role: "member", trimmed: false } } as const;
    expect(decideAdmission(facts, config(policy))).toEqual({ action: "deny", reason: "removed" });
  });

  it("keeps out a removed member even when an invitation is waiting for their email", () => {
    const facts = { ...stranger, member: { status: "removed", role: "member", trimmed: false }, invite: { role: "admin" } } as const;
    expect(decideAdmission(facts, config("auto_join"))).toEqual({ action: "deny", reason: "removed" });
  });

  it("keeps a pending member waiting", () => {
    const facts = { ...stranger, member: { status: "pending", role: "viewer", trimmed: false } } as const;
    expect(decideAdmission(facts, config("auto_join"))).toEqual({ action: "deny", reason: "pending" });
  });

  it.each(UNKNOWN_USER_POLICIES)("tells a member whose seat was taken by a trim that the plan is why, not that they wait for approval, under %s", (policy) => {
    const facts = { ...stranger, member: { status: "pending", role: "member", trimmed: true } } as const;
    expect(decideAdmission(facts, config(policy))).toEqual({ action: "deny", reason: "seat_limit" });
  });

  it("keeps a trimmed member out even when an invitation is waiting for their email: the row decides, not a second route in", () => {
    const facts = { ...stranger, member: { status: "pending", role: "member", trimmed: true }, invite: { role: "admin" } } as const;
    expect(decideAdmission(facts, config("auto_join"))).toEqual({ action: "deny", reason: "seat_limit" });
  });

  it("never reads a trim mark on an active or removed row as a seat problem", () => {
    expect(decideAdmission({ ...stranger, member: { status: "active", role: "member", trimmed: true } }, config("auto_join"))).toEqual({ action: "allow" });
    expect(decideAdmission({ ...stranger, member: { status: "removed", role: "member", trimmed: true } }, config("auto_join"))).toEqual({ action: "deny", reason: "removed" });
  });

  it("still restores the account owner whose seat was somehow trimmed", () => {
    const facts = { ...stranger, isAccountOwner: true, member: { status: "pending", role: "owner", trimmed: true } } as const;
    expect(decideAdmission(facts, config("invite_only"))).toEqual({ action: "restore_owner" });
  });

  it.each(MEMBER_STATUSES.filter((status) => status !== "active"))("never locks the account owner out of their own store, even when their row is %s", (status) => {
    const facts = { ...stranger, isAccountOwner: true, member: { status, role: "viewer", trimmed: false } } as const;
    expect(decideAdmission(facts, config("invite_only"))).toEqual({ action: "restore_owner" });
  });

  it("restores an active account owner whose role was lowered", () => {
    const facts = { ...stranger, isAccountOwner: true, member: { status: "active", role: "member", trimmed: false } } as const;
    expect(decideAdmission(facts, config("invite_only"))).toEqual({ action: "restore_owner" });
  });

  it("leaves an active owner who is the account owner alone", () => {
    const facts = { ...stranger, isAccountOwner: true, member: { status: "active", role: "owner", trimmed: false } } as const;
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
