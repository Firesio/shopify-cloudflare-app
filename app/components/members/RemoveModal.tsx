import { useTranslation } from "react-i18next";
import type { TeamRow } from "~/domain/member-team";
import { useDisplayName } from "./member-display";

export const REMOVE_MODAL_ID = "remove-modal";

/** What the confirmation needs of the person: enough to name them. */
export type Removal = Pick<TeamRow, "id" | "name" | "email" | "isInvitation">;

/**
 * The confirmation before someone is removed, or an invitation cancelled, on their own page: it names them and says what
 * happens. The confirm button shows progress and the modal stays up until the result is known (the page hides it then, through
 * the App Bridge API), so a slow request is never mistaken for a dead button.
 */
export function RemoveModal({ member, busy, onConfirm }: { readonly member: Removal; readonly busy: boolean; readonly onConfirm: (member: Removal) => void }) {
  const { t } = useTranslation("admin");
  const nameOf = useDisplayName();
  const name = nameOf(member);
  const heading = member.isInvitation ? t("members.confirmCancel.heading", { name }) : t("members.confirmRemove.heading", { name });
  const body = member.isInvitation ? t("members.confirmCancel.body", { name }) : t("members.confirmRemove.body", { name });
  return (
    <s-modal id={REMOVE_MODAL_ID} heading={heading} size="small">
      <s-paragraph>{body}</s-paragraph>
      <s-button slot="secondary-actions" commandFor={REMOVE_MODAL_ID} command="--hide">
        {member.isInvitation ? t("members.confirmCancel.keep") : t("members.confirmRemove.keep")}
      </s-button>
      <s-button slot="primary-action" variant="primary" tone="critical" loading={busy} onClick={() => onConfirm(member)}>
        {member.isInvitation ? t("members.confirmCancel.confirm") : t("members.confirmRemove.confirm")}
      </s-button>
    </s-modal>
  );
}
