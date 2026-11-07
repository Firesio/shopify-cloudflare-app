import { describe, expect, it } from "vitest";
import { MEMBER_PERMISSIONS, MEMBER_ROLES, presetOf, type MemberPermission } from "./member-access";
import { chooseRole, draftOf, editablePermissions, isChanged, isPresetDraft, setPermission, submissionOf, resetToPreset } from "./member-access-draft";
import { FLOOR_PERMISSION } from "./member-permissions";

const GRANTABLE: readonly MemberPermission[] = ["app:view", "app:manage", "billing:manage"];
/** What the page lets be ticked, and what only comes with a role. */
const RULES = { editable: ["app:manage", "billing:manage"], roleOnly: ["members:manage"] } as const;
const memberOnPreset = draftOf({ role: "member", permissions: presetOf("member") });

describe("the starting draft", () => {
  it("is the role and what the member holds now, in the registry's order", () => {
    expect(draftOf({ role: "member", permissions: ["app:manage", "app:view"] })).toEqual({ role: "member", permissions: ["app:view", "app:manage"] });
  });
});

describe("choosing a role", () => {
  it("takes the role and fills in its preset, whatever was ticked before", () => {
    const edited = setPermission(memberOnPreset, "billing:manage", true, RULES);
    expect(chooseRole(edited, "viewer")).toEqual({ role: "viewer", permissions: presetOf("viewer") });
    expect(chooseRole(edited, "admin")).toEqual({ role: "admin", permissions: presetOf("admin") });
  });

  it("fills in the preset for every role", () => {
    for (const role of MEMBER_ROLES) expect(chooseRole(memberOnPreset, role).permissions).toEqual(presetOf(role));
  });
});

describe("ticking a permission", () => {
  it("adds and removes one, keeping the registry's order and nothing twice", () => {
    const added = setPermission(memberOnPreset, "billing:manage", true, RULES);
    expect(added.permissions).toEqual(["app:view", "app:manage", "billing:manage"]);
    expect(setPermission(added, "billing:manage", true, RULES)).toEqual(added);
    expect(setPermission(added, "billing:manage", false, RULES)).toEqual(memberOnPreset);
  });

  it("keeps the role: the member is then based on it", () => {
    expect(setPermission(memberOnPreset, "billing:manage", true, RULES).role).toBe("member");
  });

  it("lets go of what only comes with a role the moment the draft stops being a preset", () => {
    const admin = chooseRole(memberOnPreset, "admin");
    expect(admin.permissions).toEqual(["app:view", "app:manage", "billing:manage", "members:manage"]);
    const ticked = setPermission(admin, "billing:manage", false, RULES);
    expect(ticked.role).toBe("admin");
    expect(ticked.permissions).toEqual(["app:view", "app:manage"]);
  });

  it("keeps what comes with a role while the draft is still that role's preset", () => {
    const admin = chooseRole(memberOnPreset, "admin");
    expect(setPermission(admin, "billing:manage", true, RULES)).toEqual(admin);
  });

  it("does not bring back what only comes with a role by ticking what is left: only the role does", () => {
    const admin = chooseRole(memberOnPreset, "admin");
    const wandered = setPermission(setPermission(admin, "billing:manage", false, RULES), "billing:manage", true, RULES);
    expect(wandered.permissions).toEqual(["app:view", "app:manage", "billing:manage"]);
    expect(isPresetDraft(wandered)).toBe(false);
    expect(resetToPreset(wandered)).toEqual(admin);
  });

  it("changes nothing for a permission the person may not change", () => {
    expect(setPermission(memberOnPreset, "members:manage", true, RULES)).toEqual(memberOnPreset);
    expect(setPermission(memberOnPreset, "app:manage", false, { editable: ["billing:manage"], roleOnly: ["members:manage"] })).toEqual(memberOnPreset);
  });

  it("never takes the way in away, even when asked", () => {
    expect(setPermission(memberOnPreset, FLOOR_PERMISSION, false, RULES)).toEqual(memberOnPreset);
  });
});

describe("which permissions can be changed", () => {
  it("is what the person may give, without the way in", () => {
    expect(editablePermissions("member", GRANTABLE)).toEqual(["app:manage", "billing:manage"]);
  });

  it("is nothing for an owner: an owner always holds everything", () => {
    expect(editablePermissions("owner", GRANTABLE)).toEqual([]);
  });
});

describe("whether the draft is a preset", () => {
  it("is when what is ticked is exactly the role's preset", () => {
    expect(isPresetDraft(memberOnPreset)).toBe(true);
    expect(isPresetDraft(setPermission(memberOnPreset, "billing:manage", true, RULES))).toBe(false);
    expect(isPresetDraft(setPermission(memberOnPreset, "app:manage", false, RULES))).toBe(false);
  });

  it("returns to a preset when the preset is ticked by hand, whatever order it was ticked in", () => {
    const wandered = setPermission(setPermission(memberOnPreset, "billing:manage", true, RULES), "billing:manage", false, RULES);
    expect(isPresetDraft(wandered)).toBe(true);
  });

  it("is offered back to a draft that is not one: the role's own permissions", () => {
    const custom = setPermission(memberOnPreset, "billing:manage", true, RULES);
    expect(resetToPreset(custom)).toEqual(memberOnPreset);
  });
});

describe("whether anything changed", () => {
  it("is false for the draft the page started from, and true once the role or a permission differs", () => {
    expect(isChanged(memberOnPreset, memberOnPreset)).toBe(false);
    expect(isChanged(chooseRole(memberOnPreset, "viewer"), memberOnPreset)).toBe(true);
    expect(isChanged(setPermission(memberOnPreset, "billing:manage", true, RULES), memberOnPreset)).toBe(true);
  });

  it("is false again when the merchant puts everything back", () => {
    const back = chooseRole(chooseRole(memberOnPreset, "viewer"), "member");
    expect(isChanged(back, memberOnPreset)).toBe(false);
  });

  it("is false for the same permissions ticked in a different order", () => {
    expect(isChanged({ role: "member", permissions: ["app:manage", "app:view"] }, memberOnPreset)).toBe(false);
  });
});

describe("what saving asks the server for", () => {
  const customMember = draftOf({ role: "member", permissions: ["app:view"] });

  it("asks nothing when nothing changed", () => {
    expect(submissionOf(memberOnPreset, memberOnPreset)).toBeUndefined();
    expect(submissionOf(customMember, customMember)).toBeUndefined();
  });

  it("asks for a role when the draft is a role's preset: a new role, or a custom member sent back to their role", () => {
    expect(submissionOf(chooseRole(memberOnPreset, "admin"), memberOnPreset)).toEqual({ intent: "changeRole", role: "admin" });
    expect(submissionOf(resetToPreset(customMember), customMember)).toEqual({ intent: "changeRole", role: "member" });
  });

  it("asks for a set, with the role it is based on, when the draft is not a preset", () => {
    const ticked = setPermission(memberOnPreset, "billing:manage", true, RULES);
    expect(submissionOf(ticked, memberOnPreset)).toEqual({ intent: "setPermissions", role: "member", permissions: ["app:view", "app:manage", "billing:manage"] });
  });

  it("asks for a set on a new role too: choose a role, then tick something different", () => {
    const draft = setPermission(chooseRole(memberOnPreset, "viewer"), "app:manage", true, RULES);
    expect(submissionOf(draft, memberOnPreset)).toEqual({ intent: "setPermissions", role: "viewer", permissions: ["app:view", "app:manage"] });
  });

  it("asks for the role alone for an owner, which has no set", () => {
    expect(submissionOf(chooseRole(memberOnPreset, "owner"), memberOnPreset)).toEqual({ intent: "changeRole", role: "owner" });
  });

  it("can tick every permission the registry has, when the person may change all of them", () => {
    const all = MEMBER_PERMISSIONS.reduce((draft, permission) => setPermission(draft, permission, true, { editable: MEMBER_PERMISSIONS, roleOnly: [] }), chooseRole(memberOnPreset, "viewer"));
    expect(all.permissions).toEqual([...MEMBER_PERMISSIONS]);
  });
});
