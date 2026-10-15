import { shopSubscriptions, adminSessionUsers } from "~/wiring.server";
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Support · Staff Console" },
];
import { Button } from "~/internal/components/ui/button";
import { Bell, Plus } from "lucide-react";
import { requireAdminUser } from "~/services/admin-auth.server";
import { supportService } from "~/wiring.server";
import { planForShopifyHandle } from "~/billing/plans";
import { isUnreadFor, statusOf } from "~/support/status";
import { Deferred, TableSkeleton } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { TicketTable } from "./index-ticket-table";

const PAID_STATUSES = new Set(["ACTIVE", "CANCELLATION_SCHEDULED"]);

async function loadTicketRows() {
  const tickets = await supportService().listOpenForStaff();
  // Only the shops that have an open ticket, not every subscription in the table.
  const currentSubscriptions = await shopSubscriptions().listCurrentForShops(
    tickets.map((ticket) => ticket.shop),
  );
  const currentByShop = new Map(currentSubscriptions.map((subscription) => [subscription.shop, subscription]));

  return tickets.map((ticket) => {
    const current = currentByShop.get(ticket.shop);
    const paid = current && PAID_STATUSES.has(current.status) ? current : undefined;
    return {
      id: ticket.id,
      shop: ticket.shop,
      shopName: ticket.shopName,
      subject: ticket.subject,
      category: ticket.category,
      status: statusOf(ticket),
      lastMessageAt: ticket.lastMessageAt,
      planName: planForShopifyHandle(paid?.planHandle)?.name ?? (paid?.planHandle ?? "Free"),
      unread: isUnreadFor({
        lastMessageAt: ticket.lastMessageAt,
        lastReadAt: ticket.staffLastReadAt,
      }),
    };
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminUser(request, { users: adminSessionUsers() });

  return {
    tickets: streamRegion("support_index", "tickets", loadTicketRows()),
  };
};

function NewTicketButton() {
  return (
    <Button size="sm" asChild>
      <Link to="/internal/support/new">
        <Plus />
        <span className="hidden lg:inline">New ticket</span>
        <span className="lg:hidden">New</span>
      </Link>
    </Button>
  );
}

/** What notifications a person gets about tickets is their own setting, kept on the notifications page. */
function NotificationSettingsLink() {
  return (
    <Button size="sm" variant="outline" asChild>
      <Link to="/internal/notifications">
        <Bell />
        <span className="hidden lg:inline">Notification settings</span>
        <span className="lg:hidden">Alerts</span>
      </Link>
    </Button>
  );
}

export default function InternalSupport() {
  const { tickets } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      {/* Outside the streamed region: it stays when the tickets fail to load. */}
      <div className="flex justify-end px-4 lg:px-6">
        <NotificationSettingsLink />
      </div>

      <Deferred
        resolve={tickets}
        fallback={
          // The toolbar's action is there from the first paint, ahead of its rows.
          <div className="flex flex-col gap-4 px-4 lg:px-6">
            <div className="flex justify-end">
              <NewTicketButton />
            </div>
            <TableSkeleton rows={8} columns={6} />
          </div>
        }
        errorTitle="Open tickets"
      >
        {(resolved) => <TicketTable tickets={resolved} toolbarEnd={<NewTicketButton />} />}
      </Deferred>
    </div>
  );
}
