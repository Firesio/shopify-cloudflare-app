import { useTranslation } from "react-i18next";

import { SkeletonBadge, SkeletonStatus, SkeletonText } from "~/components/admin/Skeleton";
import { formatDate, formatDateTime } from "~/i18n/format";
import { useLanguage } from "~/i18n/useLanguage";
import { useTimeZone } from "~/i18n/useTimeZone";
import { CATEGORY_LABEL_KEY } from "~/support/categories";
import { STATUS_TONE } from "~/support/status";
import type { TicketRow } from "~/support/ticket-list";

/** How many rows a loading list shows: a guess at the loaded count, which is only known once the data is. */
const LOADING_ROWS = 5;

type TicketRowViewProps = {
  /** The ticket, or `"loading"`: the same row, with a skeleton in place of each value. */
  readonly ticket: TicketRow | "loading";
};

/** One row, loaded or loading, so the two cannot drift: same cells, same stack, same badge slot. */
function TicketRowView({ ticket }: TicketRowViewProps) {
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  const timeZone = useTimeZone();

  if (ticket === "loading") {
    return (
      <s-table-row>
        <s-table-cell>
          <s-stack direction="inline" gap="small-300" alignItems="center">
            <SkeletonText chars={30} />
          </s-stack>
        </s-table-cell>
        <s-table-cell>
          <SkeletonText chars={14} />
        </s-table-cell>
        <s-table-cell>
          <SkeletonBadge chars={12} />
        </s-table-cell>
        <s-table-cell>
          <SkeletonText chars={12} />
        </s-table-cell>
      </s-table-row>
    );
  }

  return (
    // The whole row is clickable, delegated to the subject link so there is still one real anchor for keyboard and
    // middle-click.
    <s-table-row clickDelegate={`ticket-${ticket.id}`}>
      <s-table-cell>
        <s-stack direction="inline" gap="small-300" alignItems="center">
          <s-link id={`ticket-${ticket.id}`} href={`/app/support/${ticket.id}`}>
            {ticket.subject}
          </s-link>
          {ticket.unread && <s-badge tone="info">{t("support.unread")}</s-badge>}
        </s-stack>
      </s-table-cell>
      <s-table-cell>{t(CATEGORY_LABEL_KEY[ticket.category])}</s-table-cell>
      <s-table-cell>
        <s-badge tone={STATUS_TONE[ticket.status]}>{t(`support.status.${ticket.status}`)}</s-badge>
      </s-table-cell>
      <s-table-cell>
        {ticket.recent
          ? formatDateTime(language, ticket.lastMessageAt, timeZone)
          : formatDate(language, ticket.lastMessageAt, timeZone)}
      </s-table-cell>
    </s-table-row>
  );
}

type TicketTableProps = {
  /** The tickets, or `"loading"` while they are on their way. */
  readonly tickets: readonly TicketRow[] | "loading";
  /** Skeleton rows to show while loading. */
  readonly expectedRows?: number;
};

/*
 * `padding="none"` so the table meets the card's edges. A table is a grid of its own, with its own header rule and row
 * separators, and inset inside a padded card it reads as a second, smaller box floating in a bigger one. Full-bleed, the
 * card's edge IS the table's frame.
 *
 * Nothing above the table: the page heading already says Support and the New ticket button already says what to do, so
 * a line of prose repeating both only pushed the merchant's own tickets further down.
 *
 * While loading, the header and the section are the real ones and the body is `expectedRows` skeleton rows; the one
 * hidden status announces the wait.
 */
export function TicketTable({ tickets, expectedRows = LOADING_ROWS }: TicketTableProps) {
  const { t } = useTranslation(["admin", "common"]);

  return (
    <s-section padding="none" accessibilityLabel={tickets === "loading" ? t("support.loading") : undefined}>
      <s-table variant="auto">
        <s-table-header-row>
          <s-table-header listSlot="primary">{t("support.columns.subject")}</s-table-header>
          <s-table-header listSlot="labeled">{t("support.columns.category")}</s-table-header>
          <s-table-header listSlot="inline">{t("support.columns.status")}</s-table-header>
          <s-table-header listSlot="secondary">{t("support.columns.updated")}</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {tickets === "loading"
            ? Array.from({ length: Math.max(1, expectedRows) }, (_, index) => <TicketRowView key={index} ticket="loading" />)
            : tickets.map((ticket) => <TicketRowView key={ticket.id} ticket={ticket} />)}
        </s-table-body>
      </s-table>
      {tickets === "loading" ? <SkeletonStatus label={t("support.loading")} /> : null}
    </s-section>
  );
}
