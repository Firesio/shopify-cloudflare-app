import { describe, expect, it } from "vitest";
import {
  MEMBER_PERMISSIONS,
  MEMBER_ROLES,
  ROLE_SPECS,
  assignableRoles,
  can,
  canAssignRole,
  isMemberRole,
  permissionsOf,
  rolesHolding,
} from "./member-access";

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
    expect([...permissionsOf("owner")].sort()).toEqual([...MEMBER_PERMISSIONS].sort());
  });

  it("lets every role at least use the app", () => {
    for (const role of MEMBER_ROLES) expect(can(role, "app:view")).toBe(true);
  });

  it("keeps the plan with the owner alone", () => {
    for (const role of MEMBER_ROLES) expect(can(role, "billing:manage")).toBe(role === "owner");
  });

  it("lets only the roles that run the team manage it", () => {
    expect(MEMBER_ROLES.filter((role) => can(role, "members:manage"))).toEqual(["owner", "admin"]);
  });

  it("lets a viewer look and nothing else", () => {
    expect(permissionsOf("viewer")).toEqual(["app:view"]);
  });
});

describe("failing closed", () => {
  it.each(["", "root", "Owner", "__proto__", "constructor", "toString"])("grants nothing to the unknown role %j", (role) => {
    expect(isMemberRole(role)).toBe(false);
    expect(permissionsOf(role)).toEqual([]);
    for (const permission of MEMBER_PERMISSIONS) expect(can(role, permission)).toBe(false);
    expect(assignableRoles(role)).toEqual([]);
  });

});

describe("assigning roles", () => {
  it("lets an owner hand out every role", () => {
    expect(assignableRoles("owner")).toEqual(MEMBER_ROLES);
  });

  it("never lets a role hand out a permission it does not hold", () => {
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "admin")).toBe(true);
    expect(canAssignRole("admin", "member")).toBe(true);
    expect(canAssignRole("member", "admin")).toBe(false);
    expect(canAssignRole("viewer", "member")).toBe(false);
  });

  it("holds for every pair: you can assign a role only if you hold all of its permissions", () => {
    for (const actor of MEMBER_ROLES) {
      for (const target of MEMBER_ROLES) {
        expect(canAssignRole(actor, target)).toBe(ROLE_SPECS[target].permissions.every((permission) => can(actor, permission)));
      }
    }
  });
});

describe("rolesHolding", () => {
  it("lists the roles with a permission, in declaration order", () => {
    expect(rolesHolding("members:manage")).toEqual(["owner", "admin"]);
    expect(rolesHolding("billing:manage")).toEqual(["owner"]);
    expect(rolesHolding("app:view")).toEqual(MEMBER_ROLES);
  });

  it("agrees with `can` for every role and permission", () => {
    for (const permission of MEMBER_PERMISSIONS) {
      for (const role of MEMBER_ROLES) expect(rolesHolding(permission).includes(role)).toBe(can(role, permission));
    }
  });
});
