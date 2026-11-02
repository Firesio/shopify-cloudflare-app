import { useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { dispatchCampaignAction } from "./action.server";
import { DraftScreen } from "./draft-screen";
import { loadNew } from "./loaders.server";
import { useResultToast } from "./use-pending";

export const meta: MetaFunction = () => [{ title: "New campaign · Staff Console" }];

export const loader = ({ request }: LoaderFunctionArgs) => loadNew(request);

export const action = ({ request }: ActionFunctionArgs) => dispatchCampaignAction(request, undefined);

export default function NewCampaign() {
  const { preview, actorEmail } = useLoaderData<typeof loader>();
  useResultToast();
  return <DraftScreen campaign={undefined} preview={preview} actorEmail={actorEmail} />;
}
