import { Link } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useTranslation } from "react-i18next";
import { identity } from "~/identity";
import { audienceTextForRequest } from "~/wiring/audience.server";
import { useLanguage } from "~/i18n/useLanguage";
import { formatMoney } from "~/money";
import { FEATURED_PLAN_HANDLE, PLAN_LIST } from "~/billing/plans";
import { InstallLink } from "./install-button";

export const handle = { i18n: ["common", "public"] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const text = await audienceTextForRequest(request, "public.pricing");
  const t = text.fixedT("public");
  return { title: `${t("pricing.heading")} — ${identity.name}` };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.title ?? "" },
];

/**
 * Whatever you show here MUST match what the app actually charges. Shopify's
 * app requirements expect merchants to change plan without contacting
 * support, and a listing price that disagrees with the real charge is a
 * review failure.
 *
 * The plans themselves — name, price, features, and which one is featured —
 * come from ONE place: app/billing/plans.ts. This page, the landing page's
 * pricing teaser, and the embedded billing page all read the same catalogue,
 * so there is exactly one edit to make when a price (or the featured plan)
 * changes.
 */
export default function Pricing() {
  const { t } = useTranslation(["public", "common"]);
  const language = useLanguage();

  return (
    <section className="section">
      <div className="container stack--lg">
        <div className="stack center">
          <h1>{t("pricing.heading")}</h1>
          <p className="lead">{t("pricing.lead")}</p>
        </div>

        <p className="notice notice--warning">{t("pricing.warning")}</p>

        <div className="grid">
          {PLAN_LIST.map((plan) => {
            const popular = plan.handle === FEATURED_PLAN_HANDLE;
            const free = plan.priceMonthly.amount === 0;
            return (
              <article key={plan.handle} className="card stack">
                <div className="row">
                  <h3>{plan.name}</h3>
                  {popular && <span className="badge">{t("pricing.popular")}</span>}
                </div>
                <p>
                  <strong className="price-amount">
                    {formatMoney(language, plan.priceMonthly)}
                  </strong>{" "}
                  <span className="muted">
                    {free ? t("pricing.forever") : t("pricing.perMonth")}
                  </span>
                </p>
                <ul role="list" className="stack">
                  {plan.featureKeys.map((key) => (
                    <li key={key} className="muted">
                      {t(`common:plans.${key}`)}
                    </li>
                  ))}
                </ul>
                <InstallLink className={`btn ${popular ? "btn--primary" : "btn--secondary"}`}>
                  {t("pricing.getStarted")}
                </InstallLink>
              </article>
            );
          })}
        </div>

        <p className="muted center">
          {t("pricing.questions")}{" "}
          <Link to="/support">{t("pricing.contactSupport")}</Link>.
        </p>
      </div>
    </section>
  );
}
