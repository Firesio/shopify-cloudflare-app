import { describe, expect, it } from "vitest";
import {
  MEMBER_PERMISSIONS,
  MEMBER_ROLES,
  ROLE_SPECS,
  assignableRoles,
  can,
  canAssignRole,
  grantsOf,
  isMemberRole,
  presetOf,
  rolesHolding,
  type AccessSubject,
} from "./member-access";

/** Someone using their role's preset, which is every member who has not been given a set of their own. */
const preset = (role: string): AccessSubject => ({ role, permissions: null });
/** Someone given their own set; the role they were based on stays as it was. */
const custom = (role: string, permissions: AccessSubject["permissions"]): AccessSubject => ({ role, permissions });

describe("the registries", () => {
  it("lists each permission once, and each role only names permissions that exist", () => {
    expect(new Set(MEMBER_PERMISSIONS).size).toBe(MEMBER_PERMISSIONS.length);
    for (const role of MEMBER_ROLES) {
      const held = ROLE_SPECS[role].permissions;
      expect(new Set(held).size).toBe(held.length);
      for (const permission of held) expect(MEMBER_PERMISSIONS).toContain(permission);
    }
  });

  it("gives the owner every permission, so a new one can never be left out of the role that recovers the store", () => {
    expect([...presetOf("owner")].sort()).toEqual([...MEMBER_PERMISSIONS].sort());
  });

  it("lets every role at least use the app", () => {
    for (const role of MEMBER_ROLES) expect(can(preset(role), "app:view")).toBe(true);
  });

  it("gives the admin every permission the owner has", () => {
    expect([...presetOf("admin")].sort()).toEqual([...MEMBER_PERMISSIONS].sort());
  });

  it("keeps the plan with the owner and the admin", () => {
    for (const role of MEMBER_ROLES) expect(can(preset(role), "billing:manage")).toBe(role === "owner" || role === "admin");
  });

  it("lets only the roles that run the team manage it", () => {
    expect(MEMBER_ROLES.filter((role) => can(preset(role), "members:manage"))).toEqual(["owner", "admin"]);
  });

  it("lets a viewer look and nothing else", () => {
    expect(presetOf("viewer")).toEqual(["app:view"]);
  });
});

describe("failing closed", () => {
  it.each(["", "root", "Owner", "__proto__", "constructor", "toString"])("grants nothing to the unknown role %j", (role) => {
    expect(isMemberRole(role)).toBe(false);
    expect(presetOf(role)).toEqual([]);
    for (const permission of MEMBER_PERMISSIONS) expect(can(preset(role), permission)).toBe(false);
    expect(assignableRoles(preset(role))).toEqual([]);
  });

});

describe("assigning roles", () => {
  it("lets an owner hand out every role", () => {
    expect(assignableRoles(preset("owner"))).toEqual(MEMBER_ROLES);
  });

  it("lets only an owner make an owner, even though an admin holds every permission an owner does", () => {
    expect(canAssignRole(preset("owner"), "owner")).toBe(true);
    for (const actor of MEMBER_ROLES.filter((role) => role !== "owner")) expect(canAssignRole(preset(actor), "owner")).toBe(false);
    expect(canAssignRole(preset("unknown"), "owner")).toBe(false);
    expect(canAssignRole(preset("Owner"), "owner")).toBe(false);
  });

  it("never lets a role hand out a permission it does not hold", () => {
    expect(canAssignRole(preset("admin"), "owner")).toBe(false);
    expect(canAssignRole(preset("admin"), "admin")).toBe(true);
    expect(canAssignRole(preset("admin"), "member")).toBe(true);
    expect(canAssignRole(preset("member"), "admin")).toBe(false);
    expect(canAssignRole(preset("viewer"), "member")).toBe(false);
  });

  it("holds for every pair: you can assign a role only if you hold all of its permissions, and an owner only if you are one", () => {
    for (const actor of MEMBER_ROLES) {
      for (const target of MEMBER_ROLES) {
        const holdsAll = ROLE_SPECS[target].permissions.every((permission) => can(preset(actor), permission));
        expect(canAssignRole(preset(actor), target)).toBe(target === "owner" ? actor === "owner" : holdsAll);
      }
    }
  });
});

describe("rolesHolding", () => {
  it("lists the roles with a permission, in declaration order", () => {
    expect(rolesHolding("members:manage")).toEqual(["owner", "admin"]);
    expect(rolesHolding("billing:manage")).toEqual(["owner", "admin"]);
    expect(rolesHolding("app:view")).toEqual(MEMBER_ROLES);
  });

  it("agrees with `can` for every role and permission", () => {
    for (const permission of MEMBER_PERMISSIONS) {
      for (const role of MEMBER_ROLES) expect(rolesHolding(permission).includes(role)).toBe(can(preset(role), permission));
    }
  });
});

describe("a member with a set of their own", () => {
  it("holds exactly that set, whatever the role they were based on holds", () => {
    const mia = custom("admin", ["app:view", "app:manage"]);
    expect(grantsOf(mia)).toEqual(["app:view", "app:manage"]);
    expect(can(mia, "app:manage")).toBe(true);
    expect(can(mia, "billing:manage")).toBe(false);
    expect(can(mia, "members:manage")).toBe(false);
  });

  it("holds what the role's preset holds while they have no set, and a missing field means the same as null", () => {
    expect(grantsOf(preset("member"))).toEqual(presetOf("member"));
    expect(grantsOf({ role: "member" })).toEqual(presetOf("member"));
  });

  it("holds nothing at all for an empty set: an empty set is a set, not a missing one", () => {
    const nobody = custom("owner", []);
    expect(grantsOf(nobody)).toEqual([]);
    for (const permission of MEMBER_PERMISSIONS) expect(can(nobody, permission)).toBe(false);
  });

  it("can hand out a role only if their own set holds everything the role carries", () => {
    const limited = custom("admin", ["app:view", "app:manage"]);
    expect(canAssignRole(limited, "member")).toBe(true);
    expect(canAssignRole(limited, "viewer")).toBe(true);
    expect(canAssignRole(limited, "admin")).toBe(false);
    expect(assignableRoles(limited)).toEqual(["member", "viewer"]);
  });

  it("never makes an owner, however much they were given: that stays with the owner role", () => {
    expect(canAssignRole(custom("admin", [...MEMBER_PERMISSIONS]), "owner")).toBe(false);
  });
});
