import { useNavigation, useSubmit } from "react-router";
import type { MemberRole } from "~/domain/member-access";

/**
 * The acts of one member's page that are sent at once (let someone in, restore them, remove them), and the progress of
 * the request in flight. Every request is a post to the page's own action. Changing the role or the permissions is not
 * here: that is an edit, held in a draft and saved with the page's save bar.
 */
export function useMemberActions(memberId: string) {
  const navigation = useNavigation();
  const submit = useSubmit();

  const sending = navigation.state === "idle" ? undefined : navigation.formData;
  /** `intent:role` of the request in flight, so only the control that sent it shows progress. */
  const pending = sending === undefined ? undefined : `${String(sending.get("intent"))}:${String(sending.get("role") ?? "")}`;

  const send = (fields: Record<string, string>) => void submit({ ...fields, id: memberId }, { method: "post" });
  const act = (intent: "approve" | "restore", role: MemberRole) => send({ intent, role });
  return { pending, send, act };
}
