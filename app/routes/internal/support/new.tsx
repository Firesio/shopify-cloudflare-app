import { Form, Link, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "New Support Ticket · Staff Console" },
];
import { Alert, AlertDescription } from "~/internal/components/ui/alert";
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
import { Skeleton } from "~/internal/components/ui/skeleton";
import { Spinner } from "~/internal/components/ui/spinner";
import { useActionToast } from "~/internal/use-action-toast";
import { Send } from "lucide-react";
import { requireAdminUser } from "~/services/admin-auth.server";
import { adminUsers, shopMetrics, support, adminSessionUsers } from "~/wiring.server";
import { toSupportCategory } from "~/support/categories";
import { BODY_MAX, SUBJECT_MAX } from "~/schemas/support";
import { usePendingUploads } from "~/routes/app/support/use-pending-uploads";
import { useReplyDraft } from "~/internal/use-reply-draft";
import { createTicketOnBehalf } from "~/services/internal-admin/ops.server";
import { Deferred } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { useNewTicketForm, type ShopContactInfo } from "./new-form-state";
import { RecipientCard } from "./new-recipient-card";
import { MessageCard } from "./new-message-card";
import { OutreachNotes, OutreachPreview } from "./new-sidebar";

async function loadShopContacts(): Promise<ShopContactInfo[]> {
  const [allShops, knownContacts] = await Promise.all([
    shopMetrics().contacts(),
    support().listKnownContacts(),
  ]);

  return allShops
    .map((s) => ({
      shop: s.shop,
      isDevStore: s.isDevStore,
      shopName: s.name || knownContacts[s.shop]?.shopName || s.shop.replace(".myshopify.com", ""),
      merchantEmail: s.contactEmail || s.email || knownContacts[s.shop]?.merchantEmail || null,
      logoUrl: s.logoUrl || `https://${s.shop}/favicon.ico`,
    }))
    .sort((a, b) => a.shop.localeCompare(b.shop));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const actor = await requireAdminUser(request, { users: adminSessionUsers() });

  return {
    actorName: actor.name,
    // The recipient picker is the only thing that needs data; the rest of the
    // form paints from the first byte.
    shops: streamRegion("support_new", "shops", loadShopContacts()),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const actor = await requireAdminUser(request, { users: adminUsers() });
  const form = await request.formData();

  const selectedShop = String(form.get("shop") ?? "").trim();
  const customShop = String(form.get("customShop") ?? "").trim();
  const shop = selectedShop === "custom" || !selectedShop ? customShop : selectedShop;
  const ccRaw = String(form.get("ccEmails") ?? "").trim();
  const ccEmails = ccRaw ? ccRaw.split(",").map((e) => e.trim()).filter(Boolean) : [];
  const categoryRaw = String(form.get("category") ?? "question");
  const category = toSupportCategory(categoryRaw) ?? "question";
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const uploadIds = String(form.get("uploadIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!shop) return { error: "Store domain is required. Select an installed store or enter a domain." };
  if (!subject) return { error: "Subject is required." };
  if (subject.length > SUBJECT_MAX) return { error: `Subject cannot exceed ${SUBJECT_MAX} characters.` };
  if (!body && uploadIds.length === 0) return { error: "Please enter a message or attach a file." };
  if (body.length > BODY_MAX) return { error: `Message cannot exceed ${BODY_MAX} characters.` };

  const created = await createTicketOnBehalf({
    shop,
    subject,
    body: body || "(See attached files)",
    category,
    ccEmails,
    staffName: actor.name,
    uploadIds,
  });

  if (!created.ok) return data({ error: "Failed to create ticket" }, { status: 500 });
  return redirect(`/internal/support/${created.value.id}`);
};

export default function NewInternalSupportTicket() {
  const { shops, actorName } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();

  useActionToast(actionData, { error: actionData?.error });

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
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
              <BreadcrumbPage>New ticket</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New support ticket</h1>
          <p className="text-sm text-muted-foreground">
            Proactively contact a merchant. Store information and email address are retrieved automatically from database records.
          </p>
        </div>
      </div>

      {actionData?.error && (
        <div className="px-4 lg:px-6">
          <Alert variant="destructive">
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="px-4 lg:px-6">
        <Deferred resolve={shops} fallback={<NewTicketSkeleton />} errorTitle="The shop list">
          {(registeredShops) => <NewTicketForm shops={registeredShops} actorName={actorName} />}
        </Deferred>
      </div>
    </div>
  );
}

function NewTicketForm({ shops: registeredShops, actorName }: { shops: ShopContactInfo[]; actorName: string }) {
  const navigation = useNavigation();
  // The redirect to the new thread is a `loading` navigation: keep the form
  // locked through it so a second click cannot create a duplicate ticket.
  const isSubmitting = navigation.state !== "idle";

  const form = useNewTicketForm(registeredShops);
  const draft = useReplyDraft("body");
  const uploads = usePendingUploads("new", form.effectiveShop || undefined);

  return (
    <Form method="post" className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      <input type="hidden" name="shop" value={form.selectedShop} />

      {/* Left column: primary form fields */}
      <div className="flex flex-col gap-4">
        <RecipientCard shops={registeredShops} form={form} />
        <MessageCard form={form} draft={draft} uploads={uploads} isSubmitting={isSubmitting} />

        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild>
            <Link to="/internal/support">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting || uploads.busy}>
            {isSubmitting ? <Spinner /> : <Send />}
            {isSubmitting ? "Creating and sending…" : "Create ticket and email merchant"}
          </Button>
        </div>
      </div>

      {/* Right column: preview and staff context */}
      <div className="flex flex-col gap-4">
        <OutreachPreview effectiveShop={form.effectiveShop} contact={form.currentContact} actorName={actorName} />
        <OutreachNotes />
      </div>
    </Form>
  );
}

function SkeletonCard({ lines }: { readonly lines: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

/** Mirrors the form: recipient and message cards beside the preview column. */
function NewTicketSkeleton() {
  return (
    <div aria-hidden className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-4">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={4} />
      </div>
      <div className="flex flex-col gap-4">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );
}
