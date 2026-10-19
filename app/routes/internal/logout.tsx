import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { destroyAdminSession } from "~/services/admin-auth.server";
import { adminSessionUsers } from "~/wiring.server";

/** Sign out through the internal navigation form's POST action. */
export const action = ({ request }: ActionFunctionArgs) =>
  destroyAdminSession(request, { users: adminSessionUsers() });

export const loader = (_args: LoaderFunctionArgs) =>
  new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
