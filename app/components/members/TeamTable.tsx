import { useTranslation } from "react-i18next";
import type { MemberRole } from "~/domain/member-access";
import type { MemberStatus } from "~/domain/member-lifecycle";
import type { TeamRow } from "~/domain/member-team";
import { useLanguage } from "~/i18n/useLanguage";
import { formatDateTime } from "~/i18n/format";
import { useTimeZone } from "~/i18n/useTimeZone";
import { ROLE_TEXT } from "./role-text";

/** What a row's menu can ask for. Removing is confirmed by the page first, so it carries the row. */
export type RowAction =
  | { readonly intent: "changeRole" | "approve" | "restore"; readonly id: string; readonly role: MemberRole }
  | { readonly intent: "remove"; readonly row: TeamRow };

interface TeamTableProps {
  readonly rows: readonly TeamRow[];
  /** The roles the person looking may hand out. */
  readonly roles: readonly MemberRole[];
  /** The row whose action is being sent, so only its menu shows progress. */
  readonly pendingId: string | undefined;
  readonly onAct: (action: RowAction) => void;
}

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

function RowMenu({ row, roles, busy, onAct }: { readonly row: TeamRow; readonly roles: readonly MemberRole[]; readonly busy: boolean; readonly onAct: TeamTableProps["onAct"] }) {
  const { t } = useTranslation("admin");
  const nameOf = useDisplayName();
  const menuId = `member-menu-${row.id}`;
  if (!row.can.changeRole && !row.can.remove && !row.can.approve && !row.can.restore) return null;
  return (
    <>
      <s-button commandFor={menuId} icon="menu-horizontal" variant="tertiary" loading={busy} accessibilityLabel={t("members.actions.menu", { name: nameOf(row) })}></s-button>
      <s-menu id={menuId} accessibilityLabel={t("members.actions.menu", { name: nameOf(row) })}>
        {row.can.approve &&
          roles.map((role) => (
            <s-button key={`approve-${role}`} onClick={() => onAct({ intent: "approve", id: row.id, role })}>
              {t("members.actions.approve", { role: t(ROLE_TEXT[role].label) })}
            </s-button>
          ))}
        {row.can.changeRole &&
          roles
            .filter((role) => role !== row.role)
            .map((role) => (
              <s-button key={`role-${role}`} onClick={() => onAct({ intent: "changeRole", id: row.id, role })}>
                {t("members.actions.changeRole", { role: t(ROLE_TEXT[role].label) })}
              </s-button>
            ))}
        {row.can.restore &&
          roles.map((role) => (
            <s-button key={`restore-${role}`} onClick={() => onAct({ intent: "restore", id: row.id, role })}>
              {t("members.actions.restore", { role: t(ROLE_TEXT[role].label) })}
            </s-button>
          ))}
        {row.can.remove && (
          <s-button tone="critical" onClick={() => onAct({ intent: "remove", row })}>
            {row.isInvitation ? t("members.actions.cancelInvitation") : t("members.actions.remove")}
          </s-button>
        )}
      </s-menu>
    </>
  );
}

/** The team as a table (a list on a phone): who, their role, where they stand, and a menu of what you may do. */
export function TeamTable({ rows, roles, pendingId, onAct }: TeamTableProps) {
  const { t } = useTranslation("admin");
  const language = useLanguage();
  const timeZone = useTimeZone();
  const nameOf = useDisplayName();
  return (
    <s-section padding="none" accessibilityLabel={t("members.table.label")}>
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">{t("members.table.member")}</s-table-header>
          <s-table-header listSlot="inline">{t("members.table.role")}</s-table-header>
          <s-table-header listSlot="inline">{t("members.table.status")}</s-table-header>
          <s-table-header listSlot="labeled">{t("members.table.lastSeen")}</s-table-header>
          <s-table-header>{t("members.table.actions")}</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {rows.map((row) => (
            <s-table-row key={row.id}>
              <s-table-cell>
                <s-stack gap="small-200">
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-text type="strong">{nameOf(row)}</s-text>
                    {row.isYou && <s-badge>{t("members.table.you")}</s-badge>}
                    {row.accountOwner && <s-badge tone="info">{t("members.table.storeOwner")}</s-badge>}
                  </s-stack>
                  {row.name !== null && row.email !== null && <s-text color="subdued">{row.email}</s-text>}
                </s-stack>
              </s-table-cell>
              <s-table-cell>
                <s-badge>{t(ROLE_TEXT[row.role].label)}</s-badge>
              </s-table-cell>
              <s-table-cell>
                <s-badge tone={STATUS_TONE[row.status]}>{t(STATUS_TEXT[row.status])}</s-badge>
              </s-table-cell>
              <s-table-cell>
                {row.lastSeenAt === null ? <s-text color="subdued">{t("members.table.never")}</s-text> : formatDateTime(language, row.lastSeenAt, timeZone)}
              </s-table-cell>
              <s-table-cell>
                <RowMenu row={row} roles={roles} busy={pendingId === row.id} onAct={onAct} />
              </s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
    </s-section>
  );
}
