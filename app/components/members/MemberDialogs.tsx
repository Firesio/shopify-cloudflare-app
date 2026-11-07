import type { MemberRole } from "~/domain/member-access";
import type { MemberDetail } from "~/domain/member-team";
import { APPLY_ROLE_MODAL_ID, ApplyRoleModal } from "./ApplyRoleModal";
import { REMOVE_MODAL_ID, RemoveModal } from "./RemoveModal";

interface MemberDialogsProps {
  readonly member: Pick<MemberDetail, "id" | "name" | "email" | "isInvitation" | "custom" | "can">;
  /** The role waiting for a yes before it replaces the member's own permissions. */
  readonly applying: MemberRole | null;
  /** `intent:role` of the request in flight. */
  readonly pending: string | undefined;
  readonly send: (fields: Record<string, string>) => void;
}

/** The two questions asked before something that cannot be undone: removing someone, and replacing their own permissions with a role. */
export function MemberDialogs({ member, applying, pending, send }: MemberDialogsProps) {
  return (
    <>
      {member.can.remove && (
        <RemoveModal
          member={member}
          busy={pending?.startsWith("remove:") === true}
          onConfirm={() => {
            send({ intent: "remove" });
            void globalThis.shopify.modal.hide(REMOVE_MODAL_ID);
          }}
        />
      )}
      {member.custom && member.can.changeRole && (
        <ApplyRoleModal
          role={applying}
          busy={pending?.startsWith("changeRole:") === true}
          onConfirm={(role) => {
            send({ intent: "changeRole", role });
            void globalThis.shopify.modal.hide(APPLY_ROLE_MODAL_ID);
          }}
        />
      )}
    </>
  );
}
