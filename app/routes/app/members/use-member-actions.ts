import { useState } from "react";
import { useNavigation, useSubmit } from "react-router";
import { APPLY_ROLE_MODAL_ID } from "~/components/members/ApplyRoleModal";
import type { MemberPermission, MemberRole } from "~/domain/member-access";

/**
 * What one member's page can ask for, and the progress of the request in flight. Every request is a post to the page's own
 * action; this only builds the forms and remembers the one choice that waits for a yes.
 */
export function useMemberActions(memberId: string, hasOwnPermissions: boolean) {
  const navigation = useNavigation();
  const submit = useSubmit();
  // The role waiting for a yes, for a member whose own permissions it would replace.
  const [applying, setApplying] = useState<MemberRole | null>(null);

  const sending = navigation.state === "idle" ? undefined : navigation.formData;
  /** `intent:role` of the request in flight, so only the control that sent it shows progress. */
  const pending = sending === undefined ? undefined : `${String(sending.get("intent"))}:${String(sending.get("role") ?? "")}`;

  const send = (fields: Record<string, string>) => void submit({ ...fields, id: memberId }, { method: "post" });

  const choose = (intent: "approve" | "restore" | "changeRole", role: MemberRole) => {
    // Choosing a role throws away permissions someone chose for this member: ask first.
    if (intent === "changeRole" && hasOwnPermissions) {
      setApplying(role);
      void globalThis.shopify.modal.show(APPLY_ROLE_MODAL_ID);
      return;
    }
    send({ intent, role });
  };

  const savePermissions = (permissions: readonly MemberPermission[]) => {
    const form = new FormData();
    form.set("intent", "setPermissions");
    form.set("id", memberId);
    for (const permission of permissions) form.append("permissions", permission);
    void submit(form, { method: "post" });
  };

  return { applying, pending, send, choose, savePermissions };
}
