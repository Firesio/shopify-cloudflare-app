import { useTranslation } from "react-i18next";
import type { MemberStatus } from "~/domain/member-lifecycle";
import type { TeamRow } from "~/domain/member-team";

/** Literal keys, so a status without words fails the build rather than showing a raw key. */
const STATUS_TEXT = {
  invited: "members.status.invited",
  pending: "members.status.pending",
  active: "members.status.active",
  removed: "members.status.removed",
} as const satisfies Record<MemberStatus, string>;

const STATUS_TONE = { invited: "info", pending: "warning", active: "success", removed: "neutral" } as const satisfies Record<MemberStatus, string>;

/** The name to show: Shopify's name, else the address, else words saying we do not know who this is. */
export function useDisplayName() {
  const { t } = useTranslation("admin");
  return (row: Pick<TeamRow, "name" | "email" | "isInvitation">): string =>
    row.name ?? row.email ?? (row.isInvitation ? t("members.table.invitation") : t("members.table.unnamed"));
}

/** Where a person stands, in the list and on their own page. A lost seat is its own state, not "waiting". */
export function StatusBadge({ row }: { readonly row: Pick<TeamRow, "status" | "noSeat"> }) {
  const { t } = useTranslation("admin");
  return row.noSeat ? <s-badge tone="critical">{t("members.status.noSeat")}</s-badge> : <s-badge tone={STATUS_TONE[row.status]}>{t(STATUS_TEXT[row.status])}</s-badge>;
}
