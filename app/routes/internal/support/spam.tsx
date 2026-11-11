import { Link, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [{ title: "Spam · Staff Console" }];
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/internal/components/ui/breadcrumb";
import { Card, CardContent, CardHeader } from "~/internal/components/ui/card";
import { Skeleton } from "~/internal/components/ui/skeleton";
import { Deferred, TableSkeleton } from "~/internal/components";
import { useActionToast } from "~/internal/use-action-toast";
import { streamRegion } from "~/internal/stream-region.server";
import { isSameOriginRequest } from "~/lib/same-origin";
import type { ActionOutcome } from "~/lib/action-feedback";
import { getEnv } from "~/request-context.server";
import { requireAdminUser } from "~/services/admin-auth.server";
import { excerpt } from "~/support/excerpt";
import { adminSessionUsers, adminUsers, supportInboxService, supportTriage } from "~/wiring.server";
import { BlockedSendersCard } from "./spam-blocked-card";
import { HeldMailTable } from "./spam-held-table";
import { SPAM_INTENT_HANDLERS, readSpamIntent } from "./spam-intents.server";

async function loadSpam() {
  const triage = supportTriage();
  const [held, blocked] = await Promise.all([triage.listHeld(), triage.listBlocked()]);
  return {
    held: held.map((mail) => ({
      id: mail.id,
      senderName: mail.senderName,
      senderEmail: mail.senderEmail,
      subject: mail.subject,
      preview: excerpt(mail.body),
      reason: mail.reason,
      source: mail.source,
      receivedAt: mail.createdAt,
    })),
    blocked: blocked.map((entry) => ({ pattern: entry.pattern, createdBy: entry.createdBy, createdAt: entry.createdAt })),
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminUser(request, { users: adminSessionUsers() });
  return { spam: streamRegion("support_spam", "spam", loadSpam()) };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionOutcome> => {
  // Cheapest check first, and before anything is read or changed.
  if (!isSameOriginRequest(request.headers.get("Origin"), request.url, getEnv().SHOPIFY_APP_URL)) {
    throw new Response("Forbidden", { status: 403 });
  }
  // The authoritative repo, not the cached lookup: a disabled account must not release mail or change the blocklist.
  const actor = await requireAdminUser(request, { users: adminUsers() });
  const form = await request.formData();

  const intent = readSpamIntent(String(form.get("intent") ?? ""));
  if (intent === null) return { error: "Unknown action." };

  return SPAM_INTENT_HANDLERS[intent](
    { id: String(form.get("id") ?? ""), pattern: String(form.get("pattern") ?? "") },
    { inbox: supportInboxService(), triage: supportTriage(), actor: actor.email, at: Date.now() },
  );
};

/** A table, then the blocklist card: what the loaded page is made of. */
function SpamSkeleton() {
  return (
    <>
      <TableSkeleton rows={5} columns={5} inset />
      <div className="px-4 lg:px-6">
        <Card aria-hidden>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function Spam() {
  const { spam } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";

  useActionToast(actionData, {
    error: actionData && "error" in actionData ? actionData.error : undefined,
    success: actionData && "success" in actionData ? actionData.success : undefined,
  });

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6" aria-busy={busy}>
      <div className="flex flex-col gap-3 px-4 lg:px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/internal/support">Support</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Spam</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Held mail</h1>
          <p className="text-sm text-muted-foreground">
            Mail from strangers that looks like spam. Nothing here is a ticket until you release it.
          </p>
        </div>
      </div>

      <Deferred resolve={spam} fallback={<SpamSkeleton />} errorTitle="Held mail">
        {({ held, blocked }) => (
          <>
            <HeldMailTable rows={held} />
            <div className="px-4 lg:px-6">
              <BlockedSendersCard entries={blocked} />
            </div>
          </>
        )}
      </Deferred>
    </div>
  );
}
