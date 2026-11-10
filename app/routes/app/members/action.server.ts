import { data } from "react-router";
import { guardMember } from "~/admin/require-member.server";
import { memberDependencies } from "~/wiring.server";
import { MEMBER_INTENTS, readIntent, runIntent } from "./members.server";

/**
 * The action of both members routes (the team and one person's page): they post the same forms, so the entry is written once.
 * The permission comes first, before anything is read from the form or written: an unknown intent still needs the base one.
 * A refusal is a 400 with its reason; a result is a 200.
 */
export async function runMemberAction(request: Request) {
  const form = await request.formData();
  const intent = readIntent(form);
  const { member } = await guardMember(request, intent === undefined ? "members:manage" : MEMBER_INTENTS[intent].needs);
  const result = await runIntent(form, { actor: member, deps: memberDependencies() });
  return data(result, { status: "error" in result ? 400 : 200 });
}
