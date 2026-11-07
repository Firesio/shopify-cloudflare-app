import { useTranslation } from "react-i18next";
import type { TeamRow } from "~/domain/member-team";
import { useLanguage } from "~/i18n/useLanguage";
import { formatDateTime } from "~/i18n/format";
import { useTimeZone } from "~/i18n/useTimeZone";
import { paths } from "~/urls";
import { StatusBadge, useDisplayName } from "./member-display";
import { ROLE_TEXT } from "./role-text";

/** The link in a row that the whole row delegates its click to (Polaris: the row's primary action). */
const linkId = (id: string) => `member-link-${id}`;

/** The team as a table (a list on a phone): who, their role, where they stand. Everything you can do to a person is on their own page. */
export function TeamTable({ rows }: { readonly rows: readonly TeamRow[] }) {
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
        </s-table-header-row>
        <s-table-body>
          {rows.map((row) => (
            <s-table-row key={row.id} clickDelegate={linkId(row.id)}>
              <s-table-cell>
                <s-stack gap="small-200">
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-link id={linkId(row.id)} href={paths.member(row.id)}>{nameOf(row)}</s-link>
                    {row.isYou && <s-badge>{t("members.table.you")}</s-badge>}
                    {row.accountOwner && <s-badge tone="info">{t("members.table.storeOwner")}</s-badge>}
                  </s-stack>
                  {row.name !== null && row.email !== null && <s-text color="subdued">{row.email}</s-text>}
                </s-stack>
              </s-table-cell>
              <s-table-cell>
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-badge>{t(ROLE_TEXT[row.role].label)}</s-badge>
                  {row.custom && <s-badge tone="info">{t("members.table.custom")}</s-badge>}
                </s-stack>
              </s-table-cell>
              <s-table-cell>
                <StatusBadge row={row} />
              </s-table-cell>
              <s-table-cell>
                {row.lastSeenAt === null ? <s-text color="subdued">{t("members.table.never")}</s-text> : formatDateTime(language, row.lastSeenAt, timeZone)}
              </s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
    </s-section>
  );
}
