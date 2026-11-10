import { useState } from "react";
import { useTranslation } from "react-i18next";

import { firstIncompleteIndex, setupProgress, type SetupProgress } from "~/domain/setup-guide";
import { formatNumber } from "~/i18n/format";
import { useLanguage } from "~/i18n/useLanguage";
import { GuideStep } from "./GuideStep";

/**
 * TEMPLATE PLACEHOLDER — not a real app's setup guide.
 *
 * The three steps, their links and the fact that the first is already done are invented so the layout has something to
 * show. Nothing in this repo records whether a merchant finished any step, so `complete` is a constant. App Store
 * requirement 1.1.4 forbids showing a merchant fabricated state, so `npm run check:placeholders` refuses to deploy
 * production while any route under `app/routes/` imports this file. Replace `STEPS` with steps whose `complete` is
 * computed from the shop's real data (the progress text and the step that opens first already follow it), then delete
 * this notice.
 */
const STEPS = [
  { key: "connect", complete: true, href: "/admin/settings/general", image: "/illustrations/onboarding.svg" },
  { key: "catalog", complete: false, href: "/admin/products/new", image: "/illustrations/catalog.svg" },
  { key: "analytics", complete: false, href: "/admin/analytics", image: "/illustrations/analytics.svg" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function SetupGuideHeader({ expanded, progress, onToggle }: { expanded: boolean; progress: SetupProgress; onToggle: () => void }) {
  const { t } = useTranslation("admin");
  const language = useLanguage();
  return (
    <s-grid gap="small-200">
      <s-grid gridTemplateColumns="1fr auto" gap="small-300" alignItems="center">
        <s-heading>{t("setupGuide.heading")}</s-heading>
        <s-button
          accessibilityLabel={t("setupGuide.toggleGuide")}
          variant="tertiary"
          tone="neutral"
          icon={expanded ? "chevron-up" : "chevron-down"}
          onClick={onToggle}
        ></s-button>
      </s-grid>
      <s-paragraph>{t("setupGuide.body")}</s-paragraph>
      <s-paragraph color="subdued">
        {t("setupGuide.progress", { done: formatNumber(language, progress.done), total: formatNumber(language, progress.total) })}
      </s-paragraph>
    </s-grid>
  );
}

function SetupGuideSteps({ open, toggle }: { open: readonly StepKey[]; toggle: (key: StepKey) => void }) {
  const { t } = useTranslation("admin");
  return (
    <>
      {STEPS.map((step, index) => {
        const title = t(`setupGuide.steps.${step.key}`);
        return (
          <s-box key={step.key}>
            {index > 0 ? <s-divider></s-divider> : null}
            <GuideStep
              title={title}
              body={t(`setupGuide.steps.${step.key}Body`)}
              action={t(`setupGuide.steps.${step.key}Action`)}
              href={step.href}
              image={step.image}
              alt={t(`setupGuide.steps.${step.key}Alt`)}
              expanded={open.includes(step.key)}
              onToggle={() => toggle(step.key)}
              complete={step.complete}
              toggleLabel={t("setupGuide.toggleStep", { title })}
            />
          </s-box>
        );
      })}
    </>
  );
}

/** An `s-section` (a direct child of `s-page` once rendered). */
export function SetupGuide() {
  const [guideOpen, setGuideOpen] = useState(true);
  const [open, setOpen] = useState<readonly StepKey[]>(() => {
    const index = firstIncompleteIndex(STEPS);
    return index === null ? [] : [STEPS[index].key];
  });
  const toggle = (key: StepKey) => setOpen((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));

  return (
    <s-section>
      <s-grid gap="base">
        <SetupGuideHeader expanded={guideOpen} progress={setupProgress(STEPS)} onToggle={() => setGuideOpen((value) => !value)} />
        <s-box borderRadius="base" border="base" background="base" display={guideOpen ? "auto" : "none"}>
          <SetupGuideSteps open={open} toggle={toggle} />
        </s-box>
      </s-grid>
    </s-section>
  );
}
