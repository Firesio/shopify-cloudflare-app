import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemberRole } from "~/domain/member-access";
import { ROLE_TEXT } from "./role-text";

export const INVITE_MODAL_ID = "invite-modal";

interface InviteModalProps {
  /** The roles the person inviting may hand out. */
  readonly roles: readonly MemberRole[];
  readonly defaultRole: MemberRole;
  readonly busy: boolean;
  readonly onInvite: (input: { readonly email: string; readonly role: MemberRole }) => void;
}

/** Picks the role from the select's value without a cast: only a role on offer is ever returned. */
function pick(roles: readonly MemberRole[], value: string): MemberRole | undefined {
  return roles.find((role) => role === value);
}

/**
 * Inviting is rare, so the form lives behind the page's primary button. It stays open when something is wrong (the page
 * shows the reason). The page gives it a new `key` once an invitation was sent, which closes it and empties it: a fresh
 * form is how React resets state, with no effect to do it.
 */
export function InviteModal({ roles, defaultRole, busy, onInvite }: InviteModalProps) {
  const { t } = useTranslation("admin");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>(roles.find((candidate) => candidate === defaultRole) ?? roles[0] ?? defaultRole);

  return (
    <s-modal id={INVITE_MODAL_ID} heading={t("members.invite.heading")}>
      <s-stack gap="base">
        <s-email-field
          label={t("members.invite.email")}
          details={t("members.invite.emailHint")}
          name="email"
          value={email}
          autocomplete="off"
          onInput={(event) => setEmail(event.currentTarget.value)}
        ></s-email-field>
        <s-select
          label={t("members.invite.role")}
          name="role"
          value={role}
          details={t(ROLE_TEXT[role].description)}
          onChange={(event) => setRole(pick(roles, event.currentTarget.value) ?? role)}
        >
          {roles.map((candidate) => (
            <s-option key={candidate} value={candidate}>
              {t(ROLE_TEXT[candidate].label)}
            </s-option>
          ))}
        </s-select>
      </s-stack>
      <s-button slot="secondary-actions" commandFor={INVITE_MODAL_ID} command="--hide">
        {t("members.invite.cancel")}
      </s-button>
      <s-button slot="primary-action" variant="primary" loading={busy} disabled={email.trim() === ""} onClick={() => onInvite({ email, role })}>
        {t("members.invite.submit")}
      </s-button>
    </s-modal>
  );
}
