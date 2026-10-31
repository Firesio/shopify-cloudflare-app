import { shopMetrics, shopSubscriptions, adminSessionUsers } from "~/wiring.server";
import { Link, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Support Ticket · Staff Console" },
];
import { LifeBuoy } from "lucide-react";
import { Alert, AlertDescription } from "~/internal/components/ui/alert";
import { Badge } from "~/internal/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/internal/components/ui/breadcrumb";
import { Button } from "~/internal/components/ui/button";
import { Card, CardContent, CardHeader } from "~/internal/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/internal/components/ui/empty";
import { Skeleton } from "~/internal/components/ui/skeleton";
import { useActionToast } from "~/internal/use-action-toast";
import { requireAdminUser } from "~/services/admin-auth.server";
import { adminUsers } from "~/wiring.server";
import { supportService } from "~/wiring.server";
import { assignTicketToShop, replyToTicket, closeTicket } from "~/services/internal-admin/ops.server";
import { planForShopifyHandle } from "~/billing/plans";
import { statusOf } from "~/support/status";
import { CATEGORY_LABEL_EN } from "~/support/categories";
import { BODY_MAX } from "~/schemas/support";
import type { ThreadMessage } from "~/components/support/Thread";
import { Deferred } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { ConversationCard, DetailsCard } from "./detail-cards";
import { STATUS_LABEL, STATUS_VARIANT } from "./status-display";
import { ReplyCard } from "./detail-reply-card";
import { AssignShopCard } from "./detail-assign-card";

type StaffThread = NonNullable<Awaited<ReturnType<ReturnType<typeof supportService>["findForStaff"]>>>;

function toThreadMessages(thread: StaffThread): ThreadMessage[] {
  return thread.messages.map((message) => ({
    id: message.id,
    // From the staff side the sides are swapped: OUR messages are the ones on
    // the right, so `merchant` maps to "them". The component keys off
    // `author === "merchant"`, so flip it here rather than duplicating the view.
    author: message.author === "staff" ? "merchant" : "staff",
    authorName: message.authorName,
    body: message.body,
    createdAt: message.createdAt,
    attachments: thread.attachments
      .filter((file) => file.messageId === message.id)
      .map((file) => ({
        id: file.id,
        filename: file.filename,
        contentType: file.contentType,
        url: `/support/file/${file.id}`,
        sizeBytes: file.sizeBytes,
        kind: file.contentType.startsWith("video/") ? "video" : file.contentType.startsWith("image/") ? "image" : "file",
      })),
  }));
}

/** The whole ticket view, or `null` when there is no such ticket. */
async function loadTicketDetail(ticketId: string) {
  const service = supportService();
  const thread = await service.findForStaff(ticketId);
  if (!thread) return null;

  // Opening it counts as reading it, so the queue's New badge clears by looking.
  await service.markStaffRead(ticketId);

  const current = thread.ticket.shop === null
    ? undefined
    : await shopSubscriptions().currentForShop(thread.ticket.shop);

  return {
    ticket: {
      id: thread.ticket.id,
      shop: thread.ticket.shop,
      shopName: thread.ticket.shopName,
      subject: thread.ticket.subject,
      category: thread.ticket.category,
      status: statusOf(thread.ticket),
      createdAt: thread.ticket.createdAt,
      source: thread.ticket.source,
      // Replies go to the merchant's address, or to whoever started a
      // conversation that has no merchant record.
      merchantEmail: thread.ticket.merchantEmail ?? thread.ticket.replyAddress,
      ccEmails: thread.ticket.ccEmails,
    },
    // Only an unassigned thread needs the list; everyone else skips the query.
    assignableShops: thread.ticket.shop === null ? await loadAssignableShops() : [],
    plan: current
      ? {
          name: planForShopifyHandle(current.planHandle)?.name ?? current.planHandle ?? "Free",
          status: current.status,
        }
      : null,
    messages: toThreadMessages(thread),
  };
}

async function loadAssignableShops() {
  const all = await shopMetrics().contacts();
  return all
    .map((entry) => ({ shop: entry.shop, name: entry.name || entry.shop.replace(".myshopify.com", "") }))
    .sort((a, b) => a.shop.localeCompare(b.shop));
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  await requireAdminUser(request, { users: adminSessionUsers() });
  const ticketId = params.ticketId ?? "";

  // Only auth is awaited; the ticket streams in. A missing ticket resolves to
  // `null`, rendered as a not-found state in the region.
  return { ticketId, detail: streamRegion("support_detail", "ticket", loadTicketDetail(ticketId)) };
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const actor = await requireAdminUser(request, { users: adminUsers() });
  const ticketId = params.ticketId ?? "";
  const form = await request.formData();

  if (String(form.get("intent")) === "close") {
    await closeTicket(ticketId);
    return { success: "closed" as const };
  }

  if (String(form.get("intent")) === "assign_shop") {
    const assigned = await assignTicketToShop(ticketId, String(form.get("shop") ?? ""));
    if (assigned.ok) return { success: "assigned" as const };
    return {
      error: assigned.reason === "unknown_shop"
        ? "That shop is not one we know."
        : "This conversation already belongs to a shop.",
    };
  }

  const body = String(form.get("body") ?? "").trim();
  const uploadIds = String(form.get("uploadIds") ?? "").split(",").filter(Boolean);
  if (!body && uploadIds.length === 0) return { error: "Write a reply or attach a file first." as const };
  if (body.length > BODY_MAX) return { error: "That reply is too long." as const };

  const replied = await replyToTicket({
    ticketId,
    staffName: actor.name,
    body,
    uploadIds,
  });
  if (!replied.ok) {
    const error = replied.reason === "attachments_need_shop"
      ? "Assign this conversation to a shop before attaching files."
      : "That ticket no longer exists.";
    return { error };
  }

  return { success: "replied" as const };
};

export default function InternalSupportThread() {
  const { ticketId, detail } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const failure = actionData && "error" in actionData ? actionData.error : undefined;
  const outcome = actionData && "success" in actionData ? actionData.success : undefined;

  useActionToast(actionData, {
    error: failure,
    success: outcome === "closed" ? "Ticket closed." : outcome === "replied" ? "Reply sent." : outcome === "assigned" ? "Shop assigned." : undefined,
  });

  return (
    <div className="mx-auto w-full max-w-5xl flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/internal/support">Support</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Ticket</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {failure && (
        <div className="px-4 lg:px-6">
          <Alert variant="destructive">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        </div>
      )}

      <Deferred resolve={detail} resetKey={ticketId} fallback={<TicketSkeleton />} errorTitle="This ticket">
        {(loaded) => (loaded ? <TicketBody {...loaded} /> : <TicketNotFound />)}
      </Deferred>
    </div>
  );
}

type LoadedTicket = NonNullable<Awaited<ReturnType<typeof loadTicketDetail>>>;

function TicketBody({ ticket, messages, plan, assignableShops }: LoadedTicket) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          <p className="text-sm text-muted-foreground">
            {`${ticket.shopName || ticket.shop || ""} · ${CATEGORY_LABEL_EN[ticket.category]}`}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
      </div>

      <div className="grid gap-4 px-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:px-6">
        <div className="flex flex-col gap-4">
          <ConversationCard messages={messages} merchantLabel={ticket.shopName || ticket.shop || ""} />
          <ReplyCard ticketId={ticket.id} isClosed={ticket.status === "closed"} />
        </div>

        <div className="flex flex-col gap-4">
          {ticket.shop === null && <AssignShopCard shops={assignableShops} />}
          <DetailsCard
            status={ticket.status}
            shop={ticket.shop}
            source={ticket.source}
            plan={plan}
            createdAt={ticket.createdAt}
            merchantEmail={ticket.merchantEmail}
            ccEmails={ticket.ccEmails}
          />
        </div>
      </div>
    </>
  );
}

function TicketNotFound() {
  return (
    <div className="px-4 lg:px-6">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LifeBuoy />
          </EmptyMedia>
          <EmptyTitle>Ticket not found</EmptyTitle>
          <EmptyDescription>It may have been removed. Go back to the queue to pick another.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link to="/internal/support">Back to support</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

function SkeletonCard({ lines }: { readonly lines: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

/** Mirrors the body: a heading, then a conversation and reply box beside a details column. */
function TicketSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 px-4 md:gap-6 lg:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={4} />
        </div>
        <SkeletonCard lines={6} />
      </div>
    </div>
  );
}
