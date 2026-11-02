import { useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { dispatchCampaignAction } from "./action.server";
import { DraftScreen } from "./draft-screen";
import { loadDetail } from "./loaders.server";
import { ReportScreen } from "./report-screen";
import { useResultToast } from "./use-pending";

export const meta: MetaFunction = () => [{ title: "Campaign · Staff Console" }];

export const loader = ({ request, params }: LoaderFunctionArgs) => loadDetail(request, params.campaignId);

export const action = ({ request, params }: ActionFunctionArgs) => dispatchCampaignAction(request, params.campaignId);

/** A draft is edited; anything that has started is a report. The loader decides which, from the saved status. */
export default function CampaignDetail() {
  const { screen, actorEmail } = useLoaderData<typeof loader>();
  useResultToast();
  if (screen.kind === "draft") return <DraftScreen campaign={screen.campaign} preview={screen.preview} actorEmail={actorEmail} />;
  return (
    <ReportScreen
      campaign={screen.campaign}
      counts={screen.counts}
      recipients={screen.recipients}
      recipientStatus={screen.recipientStatus}
      recipientLimit={screen.recipientLimit}
    />
  );
}
