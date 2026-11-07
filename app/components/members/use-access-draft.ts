import { useState } from "react";
import { chooseRole, draftOf, editablePermissions, isChanged, isPresetDraft, resetToPreset, setPermission, submissionOf, type AccessDraft, type TickRules } from "~/domain/member-access-draft";
import type { MemberPermission, MemberRole } from "~/domain/member-access";
import type { CustomPermissionPolicy } from "~/domain/member-permissions";
import type { MemberDetail } from "~/domain/member-team";

/**
 * The role and permissions being edited on a member's page: the draft, what can be ticked, and what Save would ask for.
 * Every rule is in `domain/member-access-draft.ts`; this only holds the draft in state and starts it over when what is
 * saved changes (a save went through), the way React documents for state that follows a prop.
 */
export function useAccessDraft(
  member: Pick<MemberDetail, "role" | "permissions" | "customize">,
  policy: CustomPermissionPolicy,
) {
  const initial = draftOf(member);
  const truth = `${initial.role}:${initial.permissions.join(",")}`;
  const [draft, setDraft] = useState<AccessDraft>(initial);
  const [seen, setSeen] = useState(truth);
  if (seen !== truth) {
    setSeen(truth);
    setDraft(initial);
  }

  const rules: TickRules = {
    editable: member.customize.allowed ? editablePermissions(draft.role, member.customize.grantable) : [],
    roleOnly: policy.protected,
  };
  return {
    draft,
    rules,
    changed: isChanged(draft, initial),
    isPreset: isPresetDraft(draft),
    submission: submissionOf(draft, initial),
    choose: (role: MemberRole) => setDraft(chooseRole(draft, role)),
    tick: (permission: MemberPermission, on: boolean) => setDraft(setPermission(draft, permission, on, rules)),
    usePreset: () => setDraft(resetToPreset(draft)),
    discard: () => setDraft(initial),
  };
}
