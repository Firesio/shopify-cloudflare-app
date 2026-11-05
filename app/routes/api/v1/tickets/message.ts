import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { apiError, apiJson, authenticateApiRequest, handleOptions, withApiAudit } from "../helpers.server";
import { deleteStaffMessage, editStaffMessage } from "~/services/internal-admin/ops.server";
import { readJsonObject } from "~/lib/json-body";

export async function loader({ request }: LoaderFunctionArgs) {
  const opt = handleOptions(request);
  if (opt) return opt;
  return apiError("method_not_allowed", "Use PATCH to edit or DELETE to remove a staff message", 405);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** PATCH { ticket_id, message_id, body } rewrites a staff message; DELETE { ticket_id, message_id } removes it. */
export async function action({ request }: ActionFunctionArgs) {
  const opt = handleOptions(request);
  if (opt) return opt;
  if (request.method !== "PATCH" && request.method !== "DELETE") {
    return apiError("method_not_allowed", "Use PATCH or DELETE", 405);
  }

  const actor = await authenticateApiRequest(request, "mcp:tickets:write");
  const data = await readJsonObject(request);
  if (!data) return apiError("invalid_request", "Expected JSON body", 400);

  const ticketId = text(data.ticket_id);
  const messageId = text(data.message_id);
  if (!ticketId || !messageId) return apiError("invalid_request", "ticket_id and message_id are required fields", 400);

  if (request.method === "DELETE") {
    const deleted = await withApiAudit(actor, "api:delete_ticket_message", true, () => deleteStaffMessage(ticketId, messageId));
    return deleted ? apiJson({ ticketId, messageId, deleted: true }) : apiError("not_found", "Staff message not found", 404);
  }

  const body = text(data.body);
  if (!body || body.length > 10000) return apiError("invalid_request", "body is required (at most 10000 characters)", 400);
  const edited = await withApiAudit(actor, "api:edit_ticket_message", true, () => editStaffMessage(ticketId, messageId, body));
  return edited ? apiJson({ ticketId, messageId, edited: true }) : apiError("not_found", "Staff message not found", 404);
}
