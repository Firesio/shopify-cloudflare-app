import { MEMBER_PERMISSIONS, presetOf, type MemberPermission, type MemberRole } from "./member-access";
import { FLOOR_PERMISSION } from "./member-permissions";

/**
 * What the merchant is editing on a member's page, as plain values: the role in the select and the permissions ticked.
 * PURE, so every rule of the form is tested with no browser. The page holds one of these in state, shows it, and asks
 * `submissionOf` what a Save means.
 *
 * The two controls are one thing. Choosing a role FILLS the permissions with that role's preset; ticking a permission
 * keeps the role, which is then what the member is based on. A draft whose ticks are exactly its role's preset is a role;
 * any other is a set of the member's own.
 */
export interface AccessDraft {
  readonly role: MemberRole;
  readonly permissions: readonly MemberPermission[];
}

/** The permissions named in `values`, once each, in the registry's order. */
const inRegistryOrder = (values: readonly MemberPermission[]): readonly MemberPermission[] => MEMBER_PERMISSIONS.filter((permission) => values.includes(permission));

/** The draft a page starts from: the member's role, and what they hold now. */
export function draftOf(member: { readonly role: MemberRole; readonly permissions: readonly MemberPermission[] }): AccessDraft {
  return { role: member.role, permissions: inRegistryOrder(member.permissions) };
}

/** A role was chosen: it replaces whatever was ticked with its preset. */
export function chooseRole(draft: AccessDraft, role: MemberRole): AccessDraft {
  return { ...draft, role, permissions: inRegistryOrder(presetOf(role)) };
}

/** What can be ticked or unticked: what the person may give, never the way in (every member keeps it), nothing at all for an owner. */
export function editablePermissions(role: MemberRole, grantable: readonly MemberPermission[]): readonly MemberPermission[] {
  return role === "owner" ? [] : grantable.filter((permission) => permission !== FLOOR_PERMISSION);
}

/** What the page may do to the ticks: `editable` can be changed; `roleOnly` only ever comes with a role, never with a set. */
export interface TickRules {
  readonly editable: readonly MemberPermission[];
  readonly roleOnly: readonly MemberPermission[];
}

/**
 * One permission ticked or unticked. A permission that may not be changed leaves the draft as it was. The moment the ticks
 * stop being a role's preset, what only comes with a role is let go: a set never holds it, and the server would refuse one
 * that did. Only choosing the role (or `resetToPreset`) brings it back.
 */
export function setPermission(draft: AccessDraft, permission: MemberPermission, on: boolean, rules: TickRules): AccessDraft {
  if (permission === FLOOR_PERMISSION || !rules.editable.includes(permission)) return draft;
  const toggled = inRegistryOrder(on ? [...draft.permissions, permission] : draft.permissions.filter((held) => held !== permission));
  const next = { ...draft, permissions: toggled };
  return isPresetDraft(next) ? next : { ...next, permissions: toggled.filter((held) => !rules.roleOnly.includes(held)) };
}

const sameSet = (a: readonly MemberPermission[], b: readonly MemberPermission[]): boolean => a.length === b.length && a.every((permission) => b.includes(permission));

/** What is ticked is exactly the role's preset: the member is on a role, not on a set of their own. */
export function isPresetDraft(draft: AccessDraft): boolean {
  return sameSet(draft.permissions, presetOf(draft.role));
}

/** Back to the role's own permissions: the draft a merchant gets by asking to use the role's preset. */
export function resetToPreset(draft: AccessDraft): AccessDraft {
  return chooseRole(draft, draft.role);
}

/** Whether the draft differs from where the page started: another role, or other permissions. */
export function isChanged(draft: AccessDraft, initial: AccessDraft): boolean {
  return draft.role !== initial.role || !sameSet(draft.permissions, initial.permissions);
}

/** What Save asks the server for: a role (which applies its preset and drops any set), or a set with the role it is based on. */
export type AccessSubmission =
  | { readonly intent: "changeRole"; readonly role: MemberRole }
  | { readonly intent: "setPermissions"; readonly role: MemberRole; readonly permissions: readonly MemberPermission[] };

/** Nothing when nothing changed. */
export function submissionOf(draft: AccessDraft, initial: AccessDraft): AccessSubmission | undefined {
  if (!isChanged(draft, initial)) return undefined;
  return isPresetDraft(draft) ? { intent: "changeRole", role: draft.role } : { intent: "setPermissions", role: draft.role, permissions: draft.permissions };
}
