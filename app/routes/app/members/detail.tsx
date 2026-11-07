import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { guardMember } from "~/admin/require-member.server";
import { MemberDetailView } from "~/components/members/MemberDetailView";
import { memberDependencies } from "~/wiring.server";
import { MEMBER_INTENTS, loadMember, readIntent, runIntent } from "./members.server";

export const handle = { i18n: ["common", "admin"] };

/**
 * One person of the team, and everything the owner can do to them: change their role, let them in, remove or restore
 * them and, in an app that lets merchants choose, give them permissions of their own. Needs `members:manage`. A person who is not on THIS shop's team is a 404, whatever the id.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { member } = await guardMember(request, "members:manage");
  const page = await loadMember(member, params.memberId ?? "", memberDependencies());
  if (page === undefined) throw data(null, { status: 404 });
  return page;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const intent = readIntent(form);
  // The permission first, before anything is read from the form or written: an unknown intent still needs the base one.
  const { member } = await guardMember(request, intent === undefined ? "members:manage" : MEMBER_INTENTS[intent].needs);
  const result = await runIntent(form, { actor: member, deps: memberDependencies() });
  return data(result, { status: "error" in result ? 400 : 200 });
};

export default function MemberDetailPage() {
  const { member, roles, policy } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <MemberDetailView member={member} roles={roles} policy={policy} result={result} />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
