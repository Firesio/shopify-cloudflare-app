import { shops, adminSessionUsers, adminUsers } from "~/wiring.server";
import { useEffect, useRef } from "react";
import { Link, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Store } from "lucide-react";
import { toast } from "sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/internal/components/ui/breadcrumb";
import { Card, CardContent, CardHeader } from "~/internal/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/internal/components/ui/empty";
import { Skeleton } from "~/internal/components/ui/skeleton";
import { requireAdminUser } from "~/services/admin-auth.server";
import { setShopDevStatus, grantShopPromoPlan, revokeShopPromoPlan } from "~/services/internal-admin/ops.server";
import { Deferred, TableSkeleton } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { loadShopDetail } from "./detail-data.server";
import { EventHistorySection, SubscriptionHistoryCard } from "./detail-history";
import { PromoOverridesCard } from "./detail-promo";
import { ReconciliationFailureCard, ShopSummaryCard } from "./detail-summary";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.shopDomain ?? "Shop"} · Staff Console` },
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireAdminUser(request, { users: adminSessionUsers() });
  const shopDomain = decodeURIComponent(params.shop ?? "");

  // Only auth is awaited: the frame (titled from the URL) paints at once and the
  // shop's data streams in. A missing shop resolves to `null`, rendered as a
  // not-found state in the region.
  return { shopDomain, detail: streamRegion("shop_detail", "detail", loadShopDetail(shopDomain)) };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const user = await requireAdminUser(request, { users: adminUsers() });
  const shopDomain = decodeURIComponent(params.shop ?? "");
  const shop = await shops().get(shopDomain);
  if (!shop) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "toggle_dev_status") {
    await setShopDevStatus(shopDomain, !shop.isDevStore);
  } else if (intent === "grant_promo") {
    await grantShopPromoPlan(shopDomain, {
      planHandle: String(form.get("planHandle") ?? ""),
      durationDays: Number(form.get("durationDays") ?? 7),
      reason: String(form.get("reason") ?? ""),
      grantedBy: user.email,
    });
  } else if (intent === "revoke_promo") {
    const grantId = String(form.get("grantId") ?? "");
    await revokeShopPromoPlan(shopDomain, grantId, user.email);
  }

  return null;
};

/** What the merchant-facing outcome of each intent is called in its confirmation toast. */
function intentToastMessage(intent: string): string | undefined {
  switch (intent) {
    case "toggle_dev_status":
      return "Store type updated.";
    case "grant_promo":
      return "Promo granted.";
    case "revoke_promo":
      return "Promo revoked.";
    default:
      return undefined;
  }
}

/**
 * The actions here return no body, so there is no `actionData` to key a toast
 * on. A submission is finished when the navigation that carried an intent
 * returns to idle; a failing action throws to the error boundary instead, so
 * reaching idle with a remembered intent means it succeeded. The toast layers
 * on top of the page simply showing the new data.
 */
function useIntentToast() {
  const navigation = useNavigation();
  const submitted = navigation.formData?.get("intent");
  const intent = typeof submitted === "string" ? submitted : null;
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current !== null && intent === null) {
      const message = intentToastMessage(previous.current);
      if (message) toast.success(message);
    }
    previous.current = intent;
  }, [intent]);
}

export default function ShopDetail() {
  const { shopDomain, detail } = useLoaderData<typeof loader>();
  useIntentToast();

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-col gap-2 px-4 lg:px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/internal/shops">Shops</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{shopDomain}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{shopDomain}</h1>
          <p className="text-sm text-muted-foreground">Install history and subscription activity.</p>
        </div>
      </div>
      <div className="px-4 lg:px-6">
        <Deferred resolve={detail} resetKey={shopDomain} fallback={<DetailSkeleton />} errorTitle="This shop">
          {(loaded) => (loaded ? <ShopDetailBody {...loaded} /> : <ShopNotFound shopDomain={shopDomain} />)}
        </Deferred>
      </div>
    </div>
  );
}

type LoadedShop = NonNullable<Awaited<ReturnType<typeof loadShopDetail>>>;

function ShopDetailBody({
  shop,
  history,
  events,
  reconciliation,
  promoStatus,
  effective,
  promoAvailablePlans,
  now,
}: LoadedShop) {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {reconciliation?.lastFailedAt && (
        <ReconciliationFailureCard
          failureDetail={reconciliation.failureDetail}
          failureCode={reconciliation.failureCode}
        />
      )}
      <ShopSummaryCard shop={shop} />
      <PromoOverridesCard
        effective={effective}
        canGrant={shop.uninstalledAt === null}
        plans={promoAvailablePlans}
        grants={promoStatus.history}
        now={now}
      />
      <EventHistorySection events={events} />
      <SubscriptionHistoryCard history={history} />
    </div>
  );
}

function ShopNotFound({ shopDomain }: { shopDomain: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Store />
        </EmptyMedia>
        <EmptyTitle>Shop not found</EmptyTitle>
        <EmptyDescription>{`${shopDomain} has never installed this app.`}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** Mirrors the body: summary and promo cards (a title line plus rows), then two history tables. */
function DetailSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 md:gap-6">
      {[2, 3].map((lines) => (
        <Card key={lines}>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: lines }, (_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      ))}
      <TableSkeleton rows={4} columns={4} />
      <TableSkeleton rows={3} columns={4} />
    </div>
  );
}
