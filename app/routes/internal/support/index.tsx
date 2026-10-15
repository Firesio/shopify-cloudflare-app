import { shopSubscriptions, adminSessionUsers } from "~/wiring.server";
import { Link, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Support · Staff Console" },
];
import { Button } from "~/internal/components/ui/button";
import { Plus } from "lucide-react";
import { requireAdminUser } from "~/services/admin-auth.server";
import { adminUsers } from "~/wiring.server";
import { supportService } from "~/wiring.server";
import { planForShopifyHandle } from "~/billing/plans";
import { isUnreadFor, statusOf } from "~/support/status";
import { Deferred, TableSkeleton } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { NotifyCard } from "./index-notify-card";
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
  const actor = await requireAdminUser(request, { users: adminSessionUsers() });

  return {
    // From the session lookup already awaited above, so the switch paints at once.
    notifySupport: actor.notifySupport,
    tickets: streamRegion("support_index", "tickets", loadTicketRows()),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const actor = await requireAdminUser(request, { users: adminUsers() });
  const form = await request.formData();

  // The only action here is the signed-in person's own preference, so there is
  // no id to trust from the form — it is always the actor's own row.
  await adminUsers().setNotifySupport(
    actor.id,
    form.get("notifySupport") === "on",
    Date.now(),
  );
  return { saved: true as const };
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

export default function InternalSupport() {
  const { tickets, notifySupport } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <NotifyCard notifySupport={notifySupport} />
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
