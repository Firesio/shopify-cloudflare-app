import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";

import { guardMember } from "~/admin/require-member.server";
import { useActionToast } from "~/admin/use-action-toast";
import { AccessSection } from "~/components/members/AccessSection";
import { ERROR_TEXT, SUCCESS_TEXT } from "~/components/members/feedback-text";
import { MemberDialogs } from "~/components/members/MemberDialogs";
import { useDisplayName } from "~/components/members/member-display";
import { MemberFacts } from "~/components/members/MemberFacts";
import { PermissionsSection } from "~/components/members/PermissionsSection";
import { ProfileSection } from "~/components/members/ProfileSection";
import { REMOVE_MODAL_ID } from "~/components/members/RemoveModal";
import { paths } from "~/urls";
import { memberDependencies } from "~/wiring.server";
import { MEMBER_INTENTS, loadMember, readIntent, runIntent } from "./members.server";
import { useMemberActions } from "./use-member-actions";

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
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("admin");
  const nameOf = useDisplayName();
  const { applying, pending, send, choose, savePermissions } = useMemberActions(member.id, member.custom);

  const error = actionData && "error" in actionData ? actionData.error : undefined;
  const success = actionData && "success" in actionData ? actionData.success : undefined;
  // Every create/update gets a toast, and the control that sent it shows progress (@rules/polaris-app-home.md §5a).
  useActionToast(actionData, error ? { error: t(ERROR_TEXT[error]) } : success ? { success: t(SUCCESS_TEXT[success]) } : undefined);

  return (
    <s-page heading={nameOf(member)} inlineSize="base">
      <s-link slot="breadcrumb-actions" href={paths.members()}>
        {t("members.heading")}
      </s-link>
      {member.can.remove && (
        <s-button slot="secondary-actions" tone="critical" commandFor={REMOVE_MODAL_ID} command="--show">
          {member.isInvitation ? t("members.actions.cancelInvitation") : t("members.actions.remove")}
        </s-button>
      )}
      {error && (
        <s-banner slot="supplemental-start" tone="critical">
          {t(ERROR_TEXT[error])}
        </s-banner>
      )}

      <ProfileSection member={member} />
      <AccessSection member={member} roles={roles} pending={pending} onChoose={choose} />
      <PermissionsSection
        // What is saved decides where the draft starts: a new truth (a save, a role applied) starts it over.
        key={`${member.custom ? "custom" : "preset"}:${member.permissions.join(",")}`}
        name={nameOf(member)}
        held={member.permissions}
        editable={member.customize.allowed}
        grantable={member.customize.grantable}
        roleOnly={policy.protected}
        busy={pending?.startsWith("setPermissions:") === true}
        onSave={savePermissions}
      />
      <s-box slot="aside">
        <MemberFacts member={member} />
      </s-box>

      <MemberDialogs member={member} applying={applying} pending={pending} send={send} />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
