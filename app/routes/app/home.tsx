import { grantsOf } from "@firesio/members";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { identity } from "~/core/identity";
import { MEMBERS } from "~/core/members";
import { PLANS } from "~/core/plans";
import { guardMember } from "~/wiring/guard";
import { effectivePlanOf } from "~/wiring/guard";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, member } = await guardMember(request, "app:view");
  return { shop, plan: PLANS[await effectivePlanOf(shop)].name, permissions: [...grantsOf(member, MEMBERS)] };
};

/**
 * The home page of the embedded app: a placeholder a derived app replaces (`docs/ADOPTING_THE_TEMPLATE.md`). Polaris web
 * components only; the words are plain English for now (the pages of `@firesio/app-ui` take their words as label objects).
 */
export default function Home() {
  const { shop, plan, permissions } = useLoaderData<typeof loader>();
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
