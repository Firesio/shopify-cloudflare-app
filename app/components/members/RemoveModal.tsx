import { useTranslation } from "react-i18next";
import type { TeamRow } from "~/domain/member-team";
import { useDisplayName } from "./member-display";

export const REMOVE_MODAL_ID = "remove-modal";

/** What the confirmation needs of the person: enough to name them. */
export type Removal = Pick<TeamRow, "id" | "name" | "email" | "isInvitation">;

/** The confirmation before someone is removed, on their own page: it names them and says what they lose. */
export function RemoveModal({ member, busy, onConfirm }: { readonly member: Removal; readonly busy: boolean; readonly onConfirm: (member: Removal) => void }) {
  const { t } = useTranslation("admin");
  const nameOf = useDisplayName();
  const name = nameOf(member);
  return (
    <s-modal id={REMOVE_MODAL_ID} heading={t("members.confirmRemove.heading", { name })} size="small">
      <s-paragraph>{t("members.confirmRemove.body", { name })}</s-paragraph>
      <s-button slot="secondary-actions" commandFor={REMOVE_MODAL_ID} command="--hide">
        {t("members.confirmRemove.keep")}
      </s-button>
      <s-button slot="primary-action" variant="primary" tone="critical" loading={busy} onClick={() => onConfirm(member)}>
        {t("members.confirmRemove.confirm")}
      </s-button>
    </s-modal>
  );
}
