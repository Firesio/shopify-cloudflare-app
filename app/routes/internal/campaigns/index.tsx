import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import { NEW_CAMPAIGN_PATH } from "./display";
import { loadList } from "./loaders.server";
import { CampaignTable } from "./index-table";

export const meta: MetaFunction = () => [{ title: "Campaigns · Staff Console" }];

export const loader = ({ request }: LoaderFunctionArgs) => loadList(request);

export default function Campaigns() {
  const { campaigns, limit } = useLoaderData<typeof loader>();
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <CampaignTable
        campaigns={campaigns}
        limit={limit}
        toolbarStart={<p className="text-sm text-muted-foreground">Announcements the team sends by email to many merchants at once</p>}
        toolbarEnd={
          <Button size="sm" asChild>
            <Link to={NEW_CAMPAIGN_PATH}>
              <Plus />
              <span className="hidden lg:inline">New campaign</span>
              <span className="lg:hidden">New</span>
            </Link>
          </Button>
        }
      />
    </div>
  );
}
