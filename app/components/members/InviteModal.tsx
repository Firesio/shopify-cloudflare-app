import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemberRole } from "~/domain/member-access";
import type { ActivationSeat } from "~/domain/member-team";
import type { MemberActionResult } from "~/members/feedback";
import { ERROR_TEXT } from "./feedback-text";
import { ROLE_TEXT } from "./role-text";

export const INVITE_MODAL_ID = "invite-modal";

interface InviteModalProps {
  /** The roles the person inviting may hand out. */
  readonly roles: readonly MemberRole[];
  readonly defaultRole: MemberRole;
  readonly busy: boolean;
  /** The page's action result: a new object for every completed submission. */
  readonly result: MemberActionResult | undefined;
  /** Whether the plan has a seat for one more: when it has not, the form says the person will wait. */
  readonly seat: ActivationSeat;
  readonly onInvite: (input: { readonly email: string; readonly role: MemberRole }) => void;
}

/** Picks the role from the select's value without a cast: only a role on offer is ever returned. */
function pick(roles: readonly MemberRole[], value: string): MemberRole | undefined {
  return roles.find((role) => role === value);
}

/** The two refusals that belong to the address field. Every other refusal is about the request, and shows above the form. */
const FIELD_ERRORS: ReadonlySet<string> = new Set(["emailInvalid", "alreadyMember"]);

/**
 * Adding someone is rare, so the form lives behind the page's primary button. Nothing is emailed: the person joins the
 * first time they open the app with this address, and the toast says so. A refusal of the address is shown on the field, any
 * other at the top of the modal, and both go away once the merchant changes something. A saved invitation closes the modal
 * (through the App Bridge API, like the other modal) and empties the form.
 */
export function InviteModal({ roles, defaultRole, busy, result, seat, onInvite }: InviteModalProps) {
  const { t } = useTranslation("admin");
  const startRole = roles.find((candidate) => candidate === defaultRole) ?? roles[0] ?? defaultRole;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>(startRole);
  // The result whose error the merchant has already seen and moved on from.
  const [dismissed, setDismissed] = useState<MemberActionResult | undefined>(undefined);
  const [seen, setSeen] = useState(result);
  if (result !== seen) {
    setSeen(result);
    if (result && "success" in result) {
      setEmail("");
      setRole(startRole);
    }
  }

  const saved = result !== undefined && "success" in result;
  useEffect(() => {
    if (saved) void globalThis.shopify.modal.hide(INVITE_MODAL_ID);
  }, [saved, result]);

  const error = result && "error" in result && result !== dismissed ? result.error : undefined;
  const fieldError = error !== undefined && FIELD_ERRORS.has(error) ? t(ERROR_TEXT[error]) : undefined;
  const formError = error !== undefined && fieldError === undefined ? t(ERROR_TEXT[error]) : undefined;
  const canSubmit = email.trim() !== "" && !busy;
  const dismiss = () => setDismissed(result);
  const submit = () => {
    if (canSubmit) onInvite({ email, role });
  };
  // Enter in the address sends the form. The field is a custom element whose JSX props carry no key events, so the
  // listener sits on the element itself; the real key event comes from its inner input and bubbles up to it.
  const fieldRef = useRef<HTMLElementTagNameMap["s-email-field"]>(null);
  useEffect(() => {
    const field = fieldRef.current;
    if (field === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") submit();
    };
    field.addEventListener("keydown", onKeyDown);
    return () => field.removeEventListener("keydown", onKeyDown);
  });

  return (
    <s-modal id={INVITE_MODAL_ID} heading={t("members.invite.heading")}>
      <s-stack gap="base">
        {formError && <s-banner tone="critical">{formError}</s-banner>}
        {!seat.open && <s-banner tone="info">{t(seat.why === "full" ? "members.invite.seatsFull" : "members.invite.seatsUnreadable")}</s-banner>}
        <s-email-field
          label={t("members.invite.email")}
          details={t("members.invite.emailHint")}
          name="email"
          value={email}
          ref={fieldRef}
          error={fieldError}
          autocomplete="off"
          onInput={(event) => {
            setEmail(event.currentTarget.value);
            dismiss();
          }}
        ></s-email-field>
        <s-select
          label={t("members.invite.role")}
          name="role"
          value={role}
          details={t(ROLE_TEXT[role].description)}
          onChange={(event) => {
            setRole(pick(roles, event.currentTarget.value) ?? role);
            dismiss();
          }}
        >
          {roles.map((candidate) => (
            <s-option key={candidate} value={candidate}>
              {t(ROLE_TEXT[candidate].label)}
            </s-option>
          ))}
        </s-select>
      </s-stack>
      <s-button slot="secondary-actions" commandFor={INVITE_MODAL_ID} command="--hide" onClick={dismiss}>
        {t("members.invite.cancel")}
      </s-button>
      <s-button slot="primary-action" variant="primary" loading={busy} disabled={email.trim() === ""} onClick={submit}>
        {t("members.invite.submit")}
      </s-button>
    </s-modal>
  );
}
