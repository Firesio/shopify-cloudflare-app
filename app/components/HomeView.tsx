import { PageActions, PagePrimaryAction } from "@firesio/app/ui/surface";
import { identity } from "~/core/identity";

/**
 * The home page of the embedded app: a placeholder a derived app replaces (`docs/ADOPTING_THE_TEMPLATE.md`). Polaris web
 * components only; the words are plain English for now (the pages of `@firesio/app/ui/*` take their words as label objects).
 * It is a component of its own so a test can draw it on every surface (`app/dom/HomeView.dom.test.tsx`).
 */
export function HomeView({ shop, plan, permissions }: { readonly shop: string; readonly plan: string; readonly permissions: readonly string[] }) {
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
      {/* The page's actions, declared once: the header slots on the web admin, one bar at the bottom inside Shopify POS. LAST child of the page. */}
      <PageActions>
        <PagePrimaryAction href="/app/support/new">Contact support</PagePrimaryAction>
      </PageActions>
    </s-page>
  );
}
