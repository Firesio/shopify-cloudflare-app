import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";

import { pricingReturnDestination } from "~/billing/pricing-return";
import { SampleDashboard } from "~/components/dashboard/SampleDashboard";
import { SetupGuide } from "~/components/dashboard/SetupGuide";
import { guardMember } from "~/admin/require-member.server";
import { settle } from "~/admin/settle.server";
import type { Outcome } from "~/admin/outcome";
import { Deferred } from "~/components/admin/Deferred";
import { shops } from "~/wiring.server";

export const handle = { i18n: ["common", "admin"] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authentication is awaited: Shopify requires a valid session token on every
  // request, and its redirect / bounce responses must keep working.
  const { session } = await guardMember(request, "app:view");

  const destination = pricingReturnDestination(request.url);
  if (destination) throw redirect(destination);

  // The layout persists the shop identity (name included) on the first load, so
  // the name is read from D1 rather than the Admin API. It only decorates the
  // greeting, so the page renders at once with the shop domain and the name
  // streams in; a failure keeps the domain (logged by `settle`).
  const shopName = settle(
    shops().get(session.shop).then((record) => record?.name ?? session.shop),
    { event: "admin.home.shop_name.failed", shop: session.shop, route: "app/home" },
  );

  return { shopDomain: session.shop, shopName };
};

function Greeting({ shop }: { shop: string }) {
  const { t } = useTranslation("admin");
  return <s-heading>{t("dashboard.greeting", { shop })}</s-heading>;
}

function DashboardHeader({ shopDomain, shopName }: { shopDomain: string; shopName: Promise<Outcome<string>> }) {
  const { t } = useTranslation("admin");
  return (
    <>
      <s-button slot="primary-action" variant="primary" href="/admin/discounts/new">
        {t("dashboard.primaryAction")}
      </s-button>
      <s-button slot="secondary-actions" href="/admin/analytics">
        {t("dashboard.secondaryAction")}
      </s-button>

      <s-section>
        <s-stack gap="small-200">
          <Deferred
            resolve={shopName}
            pending={<Greeting shop={shopDomain} />}
            failed={<Greeting shop={shopDomain} />}
          >
            {(name) => <Greeting shop={name} />}
          </Deferred>
          <s-paragraph>{t("dashboard.intro")}</s-paragraph>
        </s-stack>
      </s-section>
    </>
  );
}

export default function Index() {
  const { shopDomain, shopName } = useLoaderData<typeof loader>();
  const { t } = useTranslation("admin");
  return (
    <s-page heading={t("dashboard.heading")}>
      <DashboardHeader shopDomain={shopDomain} shopName={shopName} />
      <SetupGuide />
      {/* Placeholder: blocks a production deploy until replaced (see SampleDashboard). */}
      <SampleDashboard />

      <s-stack direction="inline" gap="base" alignItems="center">
        <s-text color="subdued">{t("dashboard.needHelp")}</s-text>
        <s-link href="/app/support">{t("dashboard.contactSupport")}</s-link>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
