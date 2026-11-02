import { data, redirect } from "react-router";
import { isSameOriginRequest } from "~/lib/same-origin";
import { getEnv } from "~/request-context.server";
import { requireAdminUser } from "~/services/admin-auth.server";
import { adminUsers, campaignDependencies } from "~/wiring.server";
import { INTENTS, readIntent } from "./intents.server";
import { UNREADABLE, failed } from "./outcomes";

/**
 * The one action behind every announcement form: check who is asking, read the intent, hand over, answer. `id` is the
 * campaign the page is about (undefined on the "new" page).
 */
export async function dispatchCampaignAction(request: Request, id: string | undefined) {
  // Sending mail to every merchant is not something a forged cross-site form may start: cheapest check first.
  if (!isSameOriginRequest(request.headers.get("Origin"), request.url, getEnv().SHOPIFY_APP_URL)) throw new Response("Forbidden", { status: 403 });
  // The authoritative repo, not the cached lookup: a disabled account must not send for up to a minute.
  const admin = await requireAdminUser(request, { users: adminUsers() });

  const form = await request.formData();
  const intent = readIntent(form);
  const outcome = intent === undefined ? failed(UNREADABLE) : await INTENTS[intent]({ form, actor: { id: admin.id, email: admin.email }, id, deps: campaignDependencies() });
  if ("redirectTo" in outcome) return redirect(outcome.redirectTo);
  return data(outcome.result, { status: outcome.result.kind === "failed" ? 400 : 200 });
}
