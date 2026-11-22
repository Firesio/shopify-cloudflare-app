import { localeIn } from "@firesio/app";
import { grantsOf } from "@firesio/app/members";
import { SetupChecklist } from "@firesio/app/ui/setup";
import { useLoaderData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { HomeView } from "~/components/HomeView";
import { MEMBERS } from "~/core/members";
import { PLANS } from "~/core/plans";
import { firesio } from "~/firesio.server";
import { homeLabelsOf } from "~/i18n/labels";

// `firesio.loader(permission, handler)`: the member is read and the permission checked (403 otherwise) before the handler runs.
export const loader = firesio.loader("app:view", async (args) => {
  const { shop, member, services, request } = args;
  const effective = await services.billing.effectivePlan(shop);
  const handle = effective.ok ? effective.effective.planHandle : "free";
  // `PLANS.plans` is the plan table of the app's catalogue (`core/plans.ts`); a plan that declares no name shows its handle.
  const plan = Object.entries(PLANS.plans).find(([key]) => key === handle)?.[1];
  const labels = homeLabelsOf(services.i18n.translator(localeIn(services.i18n)(request, member.locale ?? null)), { shop, plan: plan?.name ?? handle, permissions: [...grantsOf(member, MEMBERS)] });
  // The onboarding card (`firesio.setup.view`): its state and its words; null while the app declares no `setup`.
  return { labels, setup: await firesio.setup.view(args) };
});

// The card's commands (Dismiss, bring it back): `members:manage` unless `{ permission }` names another.
export const action = (args: ActionFunctionArgs) => firesio.setup.action(args);

/** The loader above, drawn by `HomeView` (a component of its own so a test can draw it on every surface). */
export default function Home() {
  const { labels, setup } = useLoaderData<typeof loader>();
  return <HomeView labels={labels} setup={setup === null ? null : <SetupChecklist view={setup} />} />;
}
