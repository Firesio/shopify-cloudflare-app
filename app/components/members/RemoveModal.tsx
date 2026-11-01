import { useTranslation } from "react-i18next";
import type { TeamRow } from "~/domain/member-team";
import { useDisplayName } from "./TeamTable";

export const REMOVE_MODAL_ID = "remove-modal";

/** One confirmation for the whole table: only ever a single pending removal, so one piece of state describes it. */
export function RemoveModal({ row, busy, onConfirm }: { readonly row: TeamRow | null; readonly busy: boolean; readonly onConfirm: (row: TeamRow) => void }) {
  const { t } = useTranslation("admin");
  const nameOf = useDisplayName();
  const name = row === null ? "" : nameOf(row);
  return (
    <s-modal id={REMOVE_MODAL_ID} heading={t("members.confirmRemove.heading", { name })} size="small">
      <s-paragraph>{t("members.confirmRemove.body", { name })}</s-paragraph>
      <s-button slot="secondary-actions" commandFor={REMOVE_MODAL_ID} command="--hide">
        {t("members.confirmRemove.keep")}
      </s-button>
      <s-button slot="primary-action" variant="primary" tone="critical" loading={busy} disabled={row === null} onClick={() => row && onConfirm(row)}>
        {t("members.confirmRemove.confirm")}
      </s-button>
    </s-modal>
  );
}
