import { data } from "react-router";
import { DEFAULT_AUDIENCE } from "~/domain/campaign-audience";
import { requireAdminUser } from "~/services/admin-auth.server";
import { CAMPAIGN_LIST_LIMIT, listCampaigns, loadCampaignScreen, previewAudienceOf } from "~/services/internal-admin/ops.server";
import { adminSessionUsers } from "~/wiring.server";
import { toRecipientStatus } from "./display";

/** The list: the newest announcements, bounded. */
export async function loadList(request: Request) {
  await requireAdminUser(request, { users: adminSessionUsers() });
  return { campaigns: await listCampaigns(), limit: CAMPAIGN_LIST_LIMIT };
}

/** The "new" page: nothing is saved yet, so the count shown is for the default audience. */
export async function loadNew(request: Request) {
  const admin = await requireAdminUser(request, { users: adminSessionUsers() });
  return { actorEmail: admin.email, preview: await previewAudienceOf(DEFAULT_AUDIENCE) };
}

/** One announcement: its editor (a draft) or its progress report. */
export async function loadDetail(request: Request, id: string | undefined) {
  const admin = await requireAdminUser(request, { users: adminSessionUsers() });
  const status = toRecipientStatus(new URL(request.url).searchParams.get("status"));
  const screen = id === undefined ? undefined : await loadCampaignScreen(id, status);
  if (screen === undefined) throw data("Not found", { status: 404 });
  return { actorEmail: admin.email, screen };
}
