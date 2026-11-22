import { PageActions, PagePrimaryAction } from "@firesio/app/ui/surface";
import type { ReactNode } from "react";
import { identity } from "~/core/identity";
import type { HomeLabels } from "~/i18n/labels";

/**
 * The home page of the embedded app: a placeholder a derived app replaces (`docs/ADOPTING_THE_TEMPLATE.md`). Polaris web
 * components only; the words are the catalogue's, handed in as `labels` (`homeLabelsOf`). `setup` is the onboarding card (`SetupChecklist`, `top` of the
 * page) and `news` the team's news (`NewsCard`, under it): the route draws it, so this component needs no router and a test can draw it on every surface (`app/dom/HomeView.dom.test.tsx`).
 */
export function HomeView({ labels, setup, news }: { readonly labels: HomeLabels; readonly setup?: ReactNode; readonly news?: ReactNode }) {
  return (
    <s-page heading={identity.name}>
      {setup}
      {news}
      <s-banner tone="info" heading={labels.placeholderHeading}>
        <s-paragraph>{labels.placeholder}</s-paragraph>
      </s-banner>
      <s-section heading={labels.storeHeading}>
        <s-stack gap="small">
          <s-text>{labels.store}</s-text>
          <s-text>{labels.plan}</s-text>
          <s-text>{labels.access}</s-text>
        </s-stack>
      </s-section>
      {/* The page's actions, declared once: the header slots on the web admin, one bar at the bottom inside Shopify POS. LAST child of the page. */}
      <PageActions>
        <PagePrimaryAction href="/app/support/new">{labels.contactSupport}</PagePrimaryAction>
      </PageActions>
    </s-page>
  );
}
