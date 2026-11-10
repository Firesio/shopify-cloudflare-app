import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";

import { guardMember } from "~/admin/require-member.server";
import { useActionToast } from "~/admin/use-action-toast";
import { ERROR_TEXT, SUCCESS_TEXT } from "~/components/members/feedback-text";
import { INVITE_MODAL_ID, InviteModal } from "~/components/members/InviteModal";
import { SeatsSection } from "~/components/members/SeatsSection";
import { TeamTable } from "~/components/members/TeamTable";
import { can } from "~/domain/member-access";
import { seatsOpenIn } from "~/domain/member-team";
import { MEMBERS } from "~/members/config";
import { memberDependencies } from "~/wiring.server";
import { runMemberAction } from "./action.server";
import { loadTeam } from "./members.server";

export const handle = { i18n: ["common", "admin"] };

/**
 * The team: who from the store can use the app, and what each of them may do. One page for the owner's whole job:
 * see who is in and invite. Each person is a link to their own page (`./detail.tsx`), where the rest is done. Needs `members:manage`.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { member } = await guardMember(request, "members:manage");
  const page = await loadTeam(member, memberDependencies());
  return {
    ...page,
    // The role the invitation form starts on.
    autoJoinRole: MEMBERS.autoJoinRole,
    canChangePlan: can(member, "billing:manage"),
    // Whether going over the plan's seats can cost people theirs, so the seats section says the right thing.
    trimsOverage: MEMBERS.seatOverage.policy !== "never_remove",
  };
};

export const action = ({ request }: ActionFunctionArgs) => runMemberAction(request);

export default function Members() {
  const { rows, seats, waiting, noSeat, hidden, roles, autoJoinRole, canChangePlan, trimsOverage } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const { t } = useTranslation("admin");

  const error = actionData && "error" in actionData ? actionData.error : undefined;
  const success = actionData && "success" in actionData ? actionData.success : undefined;
  // Every create/update gets a toast, and the control that sent it shows progress (@rules/polaris-app-home.md §5a).
  // This page sends one intent only, the invitation, so its refusals are shown by the form itself (see InviteModal).
  useActionToast(actionData, error ? { error: t(ERROR_TEXT[error]) } : success ? { success: t(SUCCESS_TEXT[success]) } : undefined);

  const sending = navigation.formData;
  const pendingIntent = sending?.get("intent");

  const send = (fields: Record<string, string>) => void submit(fields, { method: "post" });

  return (
    <s-page heading={t("members.heading")} inlineSize="base">
      <s-button slot="primary-action" variant="primary" commandFor={INVITE_MODAL_ID} command="--show">
        {t("members.invite.action")}
      </s-button>

      {waiting > 0 && (
        <s-section>
          <s-banner tone="warning" heading={t("members.waiting.heading", { count: waiting })}>
            {t("members.waiting.body")}
          </s-banner>
        </s-section>
      )}

      {noSeat > 0 && (
        <s-section>
          <s-banner tone="warning" heading={t("members.noSeat.heading", { count: noSeat })}>
            {t("members.noSeat.body")}
          </s-banner>
        </s-section>
      )}

      <SeatsSection seats={seats} canChangePlan={canChangePlan} trimsOverage={trimsOverage} />
      <TeamTable rows={rows} />
      {hidden > 0 && (
        <s-section>
          <s-banner tone="info">{t("members.table.truncated", { shown: rows.length, hidden })}</s-banner>
        </s-section>
      )}

      <InviteModal
        roles={roles}
        defaultRole={autoJoinRole}
        busy={navigation.state !== "idle" && pendingIntent === "invite"}
        result={actionData}
        seat={seatsOpenIn(seats)}
        onInvite={({ email, role }) => send({ intent: "invite", email, role })}
      />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
