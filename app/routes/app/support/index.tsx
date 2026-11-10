import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";

import { guardMember } from "~/admin/require-member.server";
import { settle } from "~/admin/settle.server";
import { Deferred, FailedSection } from "~/components/admin/Deferred";
import { TicketTable } from "~/components/support/TicketTable";
import { buildTicketList, TICKET_LIST_LIMIT, type TicketList } from "~/support/ticket-list";
import { supportService } from "~/wiring.server";

export const handle = { i18n: ["common", "admin"] };

/** Derived here, not in the component: the row only renders what it is given, and the rules live in one pure function (app/support/ticket-list.ts). */
async function readTickets(shop: string): Promise<TicketList> {
  const summaries = await supportService().listRecentForShop(shop, TICKET_LIST_LIMIT + 1);
  return buildTicketList({ summaries, limit: TICKET_LIST_LIMIT, now: Date.now() });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authentication is awaited; the tickets stream so the frame renders at once.
  const { session } = await guardMember(request, "app:view");
  return {
    tickets: settle(readTickets(session.shop), {
      event: "admin.support.tickets.failed",
      shop: session.shop,
      route: "app/support",
    }),
  };
};

export default function SupportIndex() {
  const { tickets } = useLoaderData<typeof loader>();
  const { t } = useTranslation(["admin", "common"]);

  return (
    <s-page heading={t("support.heading")}>
      <s-button slot="primary-action" href="/app/support/new">
        {t("support.newTicket")}
      </s-button>

      <Deferred
        resolve={tickets}
        pending={<TicketTable tickets="loading" />}
        failed={<FailedSection heading={t("support.loadFailedHeading")} body={t("support.loadFailedBody")} />}
      >
        {(list) =>
          list.rows.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {list.truncated && (
                <s-banner tone="info" heading={t("support.list.truncated", { limit: TICKET_LIST_LIMIT })}></s-banner>
              )}
              <TicketTable tickets={list.rows} />
            </>
          )
        }
      </Deferred>
    </s-page>
  );
}

/**
 * Nothing to show yet. The page's own "New ticket" action is the one way forward, so the empty state carries no second
 * copy of it: it says why the list is empty and points up at the action.
 */
function EmptyState() {
  const { t } = useTranslation(["admin", "common"]);

  return (
    <s-section>
      <s-empty-state heading={t("support.empty.heading")}>
        <s-box slot="graphic" maxInlineSize="180px">
          <s-image src="/illustrations/support-empty.svg" alt={t("support.empty.illustrationAlt")} aspectRatio="1/0.77" objectFit="contain"></s-image>
        </s-box>
        <s-text slot="subheading">{t("support.empty.body")}</s-text>
      </s-empty-state>
    </s-section>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
