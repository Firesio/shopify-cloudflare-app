import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";

import { guardMember } from "~/admin/require-member.server";
import { useActionToast } from "~/admin/use-action-toast";
import { ERROR_TEXT, SUCCESS_TEXT } from "~/components/members/feedback-text";
import { INVITE_MODAL_ID, InviteModal } from "~/components/members/InviteModal";
import { REMOVE_MODAL_ID, RemoveModal } from "~/components/members/RemoveModal";
import { ROLE_TEXT } from "~/components/members/role-text";
import { SeatsSection } from "~/components/members/SeatsSection";
import { TeamTable, type RowAction } from "~/components/members/TeamTable";
import { can } from "~/domain/member-access";
import type { TeamRow } from "~/domain/member-team";
import { MEMBERS } from "~/members/config";
import { memberDependencies } from "~/wiring.server";
import { MEMBER_INTENTS, loadTeam, readIntent, runIntent } from "./members.server";

export const handle = { i18n: ["common", "admin"] };

/**
 * The team: who from the store can use the app, and what each of them may do. One page for the owner's whole job:
 * see who is in, let waiting people in, invite, change a role, remove. Needs `members:manage`.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { member } = await guardMember(request, "members:manage");
  const page = await loadTeam(member, memberDependencies());
  return {
    ...page,
    // How strangers are handled and as what, so the page can say so in plain words.
    policy: MEMBERS.onUnknownUser,
    autoJoinRole: MEMBERS.autoJoinRole,
    canChangePlan: can(member.role, "billing:manage"),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const intent = readIntent(form);
  // The permission first, before anything is read from the form or written: an unknown intent still needs the base one.
  const { member } = await guardMember(request, intent === undefined ? "members:manage" : MEMBER_INTENTS[intent].needs);
  const result = await runIntent(form, { actor: member, deps: memberDependencies() });
  return data(result, { status: "error" in result ? 400 : 200 });
};

/** Literal keys for how strangers are handled, so a policy without words fails the build. */
const POLICY_TEXT = {
  auto_join: "members.policy.auto_join",
  invite_only: "members.policy.invite_only",
  approval: "members.policy.approval",
} as const;

export default function Members() {
  const { rows, seats, waiting, roles, policy, autoJoinRole, canChangePlan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const { t } = useTranslation("admin");
  const [removing, setRemoving] = useState<TeamRow | null>(null);

  const error = actionData && "error" in actionData ? actionData.error : undefined;
  const success = actionData && "success" in actionData ? actionData.success : undefined;
  // A fresh invite form once an invitation was sent (see InviteModal). State is adjusted while rendering, the pattern React
  // documents for state that follows a prop, so no effect writes it.
  const [seen, setSeen] = useState(actionData);
  const [inviteKey, setInviteKey] = useState(0);
  if (actionData !== seen) {
    setSeen(actionData);
    if (success === "invited") setInviteKey(inviteKey + 1);
  }
  // Every create/update gets a toast, and the control that sent it shows progress (@rules/polaris-app-home.md §5a).
  useActionToast(actionData, error ? { error: t(ERROR_TEXT[error]) } : success ? { success: t(SUCCESS_TEXT[success]) } : undefined);

  const sending = navigation.formData;
  const pendingIntent = sending?.get("intent");
  const pendingId = navigation.state === "idle" ? undefined : String(sending?.get("id") ?? "") || undefined;

  const send = (fields: Record<string, string>) => void submit(fields, { method: "post" });
  const onAct = (act: RowAction) => {
    if (act.intent === "remove") {
      setRemoving(act.row);
      void globalThis.shopify.modal.show(REMOVE_MODAL_ID);
      return;
    }
    send({ intent: act.intent, id: act.id, role: act.role });
  };

  return (
    <s-page heading={t("members.heading")} inlineSize="base">
      <s-button slot="primary-action" variant="primary" commandFor={INVITE_MODAL_ID} command="--show">
        {t("members.invite.action")}
      </s-button>

      {error && (
        <s-section>
          <s-banner tone="critical">{t(ERROR_TEXT[error])}</s-banner>
        </s-section>
      )}

      <s-section>
        <s-stack gap="small-200">
          <s-paragraph>{t("members.intro")}</s-paragraph>
          <s-paragraph color="subdued">{t(POLICY_TEXT[policy], { role: t(ROLE_TEXT[autoJoinRole].label) })}</s-paragraph>
        </s-stack>
      </s-section>

      {waiting > 0 && (
        <s-section>
          <s-banner tone="warning" heading={t("members.waiting.heading", { count: waiting })}>
            {t("members.waiting.body")}
          </s-banner>
        </s-section>
      )}

      <SeatsSection seats={seats} canChangePlan={canChangePlan} />
      <TeamTable rows={rows} roles={roles} pendingId={pendingId} onAct={onAct} />

      <InviteModal
        key={inviteKey}
        roles={roles}
        defaultRole={autoJoinRole}
        busy={navigation.state !== "idle" && pendingIntent === "invite"}
        onInvite={({ email, role }) => send({ intent: "invite", email, role })}
      />
      <RemoveModal
        row={removing}
        busy={navigation.state !== "idle" && pendingIntent === "remove"}
        onConfirm={(row) => {
          send({ intent: "remove", id: row.id });
          void globalThis.shopify.modal.hide(REMOVE_MODAL_ID);
        }}
      />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
