import type { LoaderFunctionArgs } from "react-router";
import type { loader as layoutLoader } from "./layout";
import { useLoaderData, useRouteLoaderData } from "react-router";
import { identity } from "~/core/identity";
import { PLANS } from "~/core/plans";
import { firesio } from "~/firesio.server";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { shop, member, services } = firesio.from(context);
  firesio.requirePermission(member, "app:view");
  const effective = await services.billing.effectivePlan(shop);
  return { shop, plan: PLANS[effective.ok ? effective.effective.planHandle : "free"].name };
};

/**
 * The home page of the embedded app: a placeholder a derived app replaces (`docs/ADOPTING_THE_TEMPLATE.md`). Polaris web
 * components only; the words are plain English for now (the pages of `@firesio/app/ui/*` take their words as label objects).
 */
export default function Home() {
  const { shop, plan } = useLoaderData<typeof loader>();
  // What the member holds is computed once, by the layout's loader (it also decides the menu): never again per page.
  const permissions = useRouteLoaderData<typeof layoutLoader>("routes/app/layout")?.permissions ?? [];
  return (
    <s-page heading={identity.name}>
      <s-banner tone="info" heading="Placeholder">
        <s-paragraph>TODO: replace this page with the app&apos;s own home. Everything under the menu comes from the shared libraries.</s-paragraph>
      </s-banner>
      <s-section heading="Setup guide">
        <s-stack gap="base">
          <s-paragraph>1. TODO: first thing a merchant does after installing.</s-paragraph>
          <s-paragraph>2. TODO: second step.</s-paragraph>
          <s-paragraph>3. TODO: third step.</s-paragraph>
        </s-stack>
      </s-section>
      <s-section heading="Your store">
        <s-stack gap="small">
          <s-text>Store: {shop}</s-text>
          <s-text>Plan: {plan}</s-text>
          <s-text>Your access: {permissions.join(", ")}</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}
