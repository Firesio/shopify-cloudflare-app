import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router";
import { data, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { guardMember } from "~/admin/require-member.server";
import { MemberDetailView } from "~/components/members/MemberDetailView";
import { memberDependencies } from "~/wiring.server";
import { runMemberAction } from "./action.server";
import { loadMember } from "./members.server";

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

export const action = ({ request }: ActionFunctionArgs) => runMemberAction(request);

/**
 * A cancelled invitation is deleted, so reloading this page would answer 404 for a moment before the view leaves for the team.
 * Skipping the reload for that one result keeps the page as it is until it navigates away; every other result reloads as usual.
 */
export function shouldRevalidate({ actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs): boolean {
  const cancelled = typeof actionResult === "object" && actionResult !== null && "success" in actionResult && actionResult.success === "invitationCancelled";
  return cancelled ? false : defaultShouldRevalidate;
}

export default function MemberDetailPage() {
  const { member, roles, policy, canChangePlan } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <MemberDetailView member={member} roles={roles} policy={policy} canChangePlan={canChangePlan} result={result} />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
