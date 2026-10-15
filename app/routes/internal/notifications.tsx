import { data } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import type { NotificationActionError, NotificationActionResult } from "~/domain/staff-notification-view";
import { isSameOriginRequest } from "~/lib/same-origin";
import { requireAdminUser } from "~/services/admin-auth.server";
import { loadSettings } from "~/services/staff-notifications";
import { adminSessionUsers, adminUsers, staffNotificationSettings } from "~/wiring.server";
import { getEnv } from "~/request-context.server";
import { NOTIFICATION_HANDLERS, readNotificationIntent } from "./notifications-intents.server";
import { NotificationsPage } from "./notifications/page";

export const meta: MetaFunction = () => [{ title: "Notifications · Staff Console" }];

/**
 * A person's own settings: any signed-in staff member, never owner-only. The settings are always the caller's,
 * selected by their session, never by a parameter, so there is no way to ask for someone else's.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireAdminUser(request, { users: adminSessionUsers() });
  return loadSettings(user.id, staffNotificationSettings());
};

function failure(error: NotificationActionError) {
  const result: NotificationActionResult = { error };
  return data(result, { status: 400 });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // Cheapest check first, and before anything is read or changed.
  if (!isSameOriginRequest(request.headers.get("Origin"), request.url, getEnv().SHOPIFY_APP_URL)) throw new Response("Forbidden", { status: 403 });
  // The authoritative repo, not the cached lookup: a disabled account must not change settings for up to a minute.
  const user = await requireAdminUser(request, { users: adminUsers() });

  const fields = Object.fromEntries(await request.formData());
  const intent = readNotificationIntent(fields);
  if (!intent) return failure("invalid");

  const outcome = await NOTIFICATION_HANDLERS[intent](fields, {
    adminId: user.id,
    userAgent: request.headers.get("User-Agent") ?? "",
    deps: staffNotificationSettings(),
  });
  if (!outcome.ok) return failure(outcome.reason);
  const result: NotificationActionResult = outcome.value;
  return data(result);
};

export default function Notifications() {
  return <NotificationsPage />;
}
