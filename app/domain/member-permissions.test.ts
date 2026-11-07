import { describe, expect, it } from "vitest";
import { MEMBER_PERMISSIONS, MEMBER_ROLES, type AccessSubject, type MemberPermission } from "./member-access";
import {
  ALWAYS_PROTECTED,
  FLOOR_PERMISSION,
  checkCustomPermissions,
  customPolicy,
  grantableBy,
  isCustomizable,
  heldBy,
  readStoredPermissions,
  serializePermissions,
} from "./member-permissions";

const owner: AccessSubject = { role: "owner", permissions: null };
const admin: AccessSubject = { role: "admin", permissions: null };
const member: AccessSubject = { role: "member", permissions: null };
const on = customPolicy({ enabled: true, alsoProtected: [] });
const off = customPolicy({ enabled: false, alsoProtected: [] });

describe("the policy", () => {
  it("always protects the permission that manages the team, whatever the app adds", () => {
    expect(ALWAYS_PROTECTED).toContain("members:manage");
    expect(on.protected).toEqual(["members:manage"]);
    // In the registry's order, so the same policy always reads the same.
    expect(customPolicy({ enabled: true, alsoProtected: ["billing:manage"] }).protected).toEqual(["billing:manage", "members:manage"]);
  });

  it("names a protected permission once, even if the app names it again", () => {
    expect(customPolicy({ enabled: true, alsoProtected: ["members:manage", "billing:manage", "billing:manage"] }).protected).toEqual(["billing:manage", "members:manage"]);
  });

  it("carries the app's switch as it is", () => {
    expect(on.enabled).toBe(true);
    expect(off.enabled).toBe(false);
  });
});

describe("reading a stored set", () => {
  it("reads no value as no set: the role's preset applies", () => {
    expect(readStoredPermissions(null)).toEqual({ kind: "preset" });
  });

  it("reads a list as the permissions it names, in the registry's order and once each", () => {
    expect(readStoredPermissions('["app:manage","app:view","app:view"]')).toEqual({ kind: "set", permissions: ["app:view", "app:manage"] });
    expect(readStoredPermissions("[]")).toEqual({ kind: "set", permissions: [] });
  });

  it("drops a permission the code no longer knows rather than keeping a name nothing checks", () => {
    expect(readStoredPermissions('["app:view","retired:thing","__proto__"]')).toEqual({ kind: "set", permissions: ["app:view"] });
  });

  it("keeps the names in a list and drops entries that are not names", () => {
    expect(readStoredPermissions('[1,"app:view",null,{"a":1}]')).toEqual({ kind: "set", permissions: ["app:view"] });
  });

  it.each(["", "not json", "{}", '"app:view"', "42", "true", "null", '{"permissions":["app:view"]}'])("says the damaged value %j is damaged, so the caller can say so and read it as an empty set, never as 'no set'", (raw) => {
    expect(readStoredPermissions(raw)).toEqual({ kind: "damaged" });
  });

  it("round-trips through what it writes, in the registry's order", () => {
    const set: MemberPermission[] = ["app:manage", "app:view"];
    expect(serializePermissions(set)).toBe('["app:view","app:manage"]');
    expect(readStoredPermissions(serializePermissions(set))).toEqual({ kind: "set", permissions: ["app:view", "app:manage"] });
  });
});

describe("what a stored set holds", () => {
  it("is nothing set for a preset, the permissions for a set, and an EMPTY set for a damaged value", () => {
    expect(heldBy({ kind: "preset" })).toBeNull();
    expect(heldBy({ kind: "set", permissions: ["app:view"] })).toEqual(["app:view"]);
    expect(heldBy({ kind: "damaged" })).toEqual([]);
  });
});

describe("what someone may give", () => {
  it("is what the giver holds, without what is protected", () => {
    expect(grantableBy(owner, on)).toEqual(["app:view", "app:manage", "billing:manage"]);
    expect(grantableBy(admin, on)).toEqual(["app:view", "app:manage", "billing:manage"]);
    expect(grantableBy(member, on)).toEqual(["app:view", "app:manage"]);
  });

  it("is less when the app protects more, and nothing is protected twice", () => {
    expect(grantableBy(owner, customPolicy({ enabled: true, alsoProtected: ["billing:manage"] }))).toEqual(["app:view", "app:manage"]);
  });

  it("follows the giver's own set, not their role", () => {
    expect(grantableBy({ role: "admin", permissions: ["app:view", "app:manage"] }, on)).toEqual(["app:view", "app:manage"]);
  });

  it("is nothing for someone who holds nothing", () => {
    expect(grantableBy({ role: "owner", permissions: [] }, on)).toEqual([]);
  });
});

describe("checking a set someone asks for", () => {
  const check = (requested: readonly string[], actor: AccessSubject = owner, policy = on) => checkCustomPermissions(actor, requested, policy);

  it("accepts a set the giver may give, in the registry's order and once each", () => {
    expect(check(["app:manage", "app:view", "app:manage"])).toEqual({ ok: true, value: ["app:view", "app:manage"] });
  });

  it("accepts the floor on its own: a person who can only look", () => {
    expect(check([FLOOR_PERMISSION])).toEqual({ ok: true, value: [FLOOR_PERMISSION] });
  });

  it.each([["nothing at all", []], ["no way in", ["app:manage"]]])("refuses %s: someone with no way in is a seat that does nothing, and removing them is the way", (_label, requested) => {
    expect(check(requested)).toEqual({ ok: false, reason: "permissionInvalid" });
  });

  it.each(["root", "App:view", "", "app:*", "__proto__", "constructor"])("refuses the permission %j that is not in the registry", (name) => {
    expect(check(["app:view", name])).toEqual({ ok: false, reason: "permissionInvalid" });
  });

  it("says a name that is not a permission before it says a permission may not be given", () => {
    expect(check(["app:view", "members:manage", "nonsense"])).toEqual({ ok: false, reason: "permissionInvalid" });
  });

  it("refuses the permission that manages the team, from an owner too", () => {
    expect(check(["app:view", "members:manage"])).toEqual({ ok: false, reason: "cannotGrant" });
    expect(check(["app:view", "members:manage"], admin)).toEqual({ ok: false, reason: "cannotGrant" });
  });

  it("refuses what the app also protects", () => {
    const strict = customPolicy({ enabled: true, alsoProtected: ["billing:manage"] });
    expect(check(["app:view", "billing:manage"], owner, strict)).toEqual({ ok: false, reason: "cannotGrant" });
    expect(check(["app:view", "billing:manage"], owner, on)).toEqual({ ok: true, value: ["app:view", "billing:manage"] });
  });

  it("refuses a permission the giver lacks: nobody gives what they do not have", () => {
    expect(check(["app:view", "billing:manage"], member)).toEqual({ ok: false, reason: "cannotGrant" });
    expect(check(["app:view", "app:manage"], { role: "admin", permissions: ["app:view"] })).toEqual({ ok: false, reason: "cannotGrant" });
  });

  it("holds for every permission and every giver: a set is accepted exactly when each member of it is grantable and the floor is in", () => {
    for (const actor of MEMBER_ROLES.map((role): AccessSubject => ({ role, permissions: null }))) {
      for (const permission of MEMBER_PERMISSIONS) {
        const requested = permission === FLOOR_PERMISSION ? [permission] : [FLOOR_PERMISSION, permission];
        const result = check(requested, actor);
        expect(result.ok).toBe(requested.every((name) => grantableBy(actor, on).includes(name as MemberPermission)));
      }
    }
  });
});

describe("who may be given a set", () => {
  const target = (overrides: Partial<{ role: string; status: "invited" | "pending" | "active" | "removed"; accountOwner: boolean }> = {}) => ({
    role: "member",
    status: "active" as const,
    accountOwner: false,
    ...overrides,
  });

  it("is an active member, when the app lets merchants do it", () => {
    expect(isCustomizable(target(), on)).toBe(true);
    expect(isCustomizable(target({ role: "admin" }), on)).toBe(true);
  });

  it("is nobody when the app does not", () => {
    expect(isCustomizable(target(), off)).toBe(false);
  });

  it.each(["invited", "pending", "removed"] as const)("is nobody who is %s: they get a role when they are let in, and a set after", (status) => {
    expect(isCustomizable(target({ status }), on)).toBe(false);
  });

  it("is never an owner, nor the person Shopify says owns the store: both always hold everything", () => {
    expect(isCustomizable(target({ role: "owner" }), on)).toBe(false);
    expect(isCustomizable(target({ accountOwner: true }), on)).toBe(false);
  });
});
