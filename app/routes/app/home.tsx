import type { loader as layoutLoader } from "./layout";
import { useLoaderData, useRouteLoaderData } from "react-router";
import { HomeView } from "~/components/HomeView";
import { firesio } from "~/firesio.server";

// `firesio.loader(permission, handler)`: the member is read and the permission checked (403 otherwise) before the handler runs.
export const loader = firesio.loader("app:view", async ({ shop, services }) => {
  const effective = await services.billing.effectivePlan(shop);
  const handle = effective.ok ? effective.effective.planHandle : "free";
  // `services.plans` is the plan table of the app's catalogue (`core/plans.ts`); a plan that declares no name shows its handle.
  return { shop, plan: services.plans[handle].name ?? handle };
});

/** The loader above, drawn by `HomeView` (a component of its own so a test can draw it on every surface). */
export default function Home() {
  const { shop, plan } = useLoaderData<typeof loader>();
  // What the member holds is computed once, by the layout's loader (it also decides the menu): never again per page.
  const permissions = useRouteLoaderData<typeof layoutLoader>("routes/app/layout")?.permissions ?? [];
  return <HomeView shop={shop} plan={plan} permissions={permissions} />;
}
