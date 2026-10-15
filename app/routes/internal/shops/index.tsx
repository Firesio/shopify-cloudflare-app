import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Shops · Staff Console" },
];
import { requireAdminUser } from "~/services/admin-auth.server";
import { adminSessionUsers } from "~/wiring.server";
import { listShopsDirectory } from "~/services/internal-admin/ops.server";
import { Deferred, TableSkeleton } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { ShopsTable } from "./table";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminUser(request, { users: adminSessionUsers() });

  const shops = listShopsDirectory({ limit: 1_000 }).then((directory) =>
    directory.map((shop) => ({
      shop: shop.shop,
      name: shop.name,
      email: shop.contactEmail || shop.email,
      logoUrl: shop.logoUrl || `https://${shop.shop}/favicon.ico`,
      installedAt: shop.installedAt,
      active: shop.uninstalledAt === null,
      isDevStore: shop.isDevStore,
      planName: shop.planName,
    })),
  );

  return { shops: streamRegion("shops", "directory", shops) };
};

export default function Shops() {
  const { shops } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <Deferred
        resolve={shops}
        fallback={<TableSkeleton rows={10} columns={5} inset />}
        errorTitle="The shops list"
        insetError
      >
        {(resolved) => <ShopsTable shops={resolved} />}
      </Deferred>
    </div>
  );
}
