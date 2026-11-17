import type { loader as layoutLoader } from "./layout";
import { useLoaderData, useRouteLoaderData } from "react-router";
import { identity } from "~/core/identity";
import { firesio } from "~/firesio.server";

// `firesio.loader(permission, handler)`: the member is read and the permission checked (403 otherwise) before the handler runs.
export const loader = firesio.loader("app:view", async ({ shop, services }) => {
  const effective = await services.billing.effectivePlan(shop);
  const handle = effective.ok ? effective.effective.planHandle : "free";
  // `services.plans` is the plan table of the app's catalogue (`core/plans.ts`); a plan that declares no name shows its handle.
  return { shop, plan: services.plans[handle].name ?? handle };
});

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
