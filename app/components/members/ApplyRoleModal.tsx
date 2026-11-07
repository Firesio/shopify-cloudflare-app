import { useTranslation } from "react-i18next";
import type { MemberRole } from "~/domain/member-access";
import { ROLE_TEXT } from "./role-text";

export const APPLY_ROLE_MODAL_ID = "apply-role-modal";

/**
 * The confirmation before a role replaces a member's own permissions: the set they were given is discarded and cannot be
 * got back, so it is asked first. One dialog for the page; only ever a single pending choice, so one piece of state says which.
 */
export function ApplyRoleModal({ role, busy, onConfirm }: { readonly role: MemberRole | null; readonly busy: boolean; readonly onConfirm: (role: MemberRole) => void }) {
  const { t } = useTranslation("admin");
  const name = role === null ? "" : t(ROLE_TEXT[role].label);
  return (
    <s-modal id={APPLY_ROLE_MODAL_ID} heading={t("members.applyRole.heading", { role: name })} size="small">
      <s-paragraph>{t("members.applyRole.body", { role: name })}</s-paragraph>
      <s-button slot="secondary-actions" commandFor={APPLY_ROLE_MODAL_ID} command="--hide">
        {t("members.applyRole.keep")}
      </s-button>
      <s-button slot="primary-action" variant="primary" loading={busy} disabled={role === null} onClick={() => role && onConfirm(role)}>
        {t("members.applyRole.confirm", { role: name })}
      </s-button>
    </s-modal>
  );
}
