import { useEffect } from "react";
import { Form, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useActionToast } from "~/admin/use-action-toast";
import type { MemberRole } from "~/domain/member-access";
import type { CustomPermissionPolicy } from "~/domain/member-permissions";
import type { MemberDetail } from "~/domain/member-team";
import type { MemberActionResult } from "~/members/feedback";
import { paths } from "~/urls";
import { RouteSaveBar } from "../RouteSaveBar";
import { AccessFields } from "./AccessFields";
import { AccessSection } from "./AccessSection";
import { ERROR_TEXT, SUCCESS_TEXT } from "./feedback-text";
import { useDisplayName } from "./member-display";
import { MemberFacts } from "./MemberFacts";
import { PermissionsSection } from "./PermissionsSection";
import { ProfileSection } from "./ProfileSection";
import { REMOVE_MODAL_ID, RemoveModal } from "./RemoveModal";
import { useAccessDraft } from "./use-access-draft";
import { useMemberActions } from "./use-member-actions";

interface MemberDetailViewProps {
  readonly member: MemberDetail;
  /** The roles the person looking may hand out. */
  readonly roles: readonly MemberRole[];
  readonly policy: CustomPermissionPolicy;
  /** The looker may change the plan, so a full-seats note can link to it. */
  readonly canChangePlan: boolean;
  /** The page's action result: a new object for every completed submission, undefined before any. */
  readonly result: MemberActionResult | undefined;
}

/**
 * One member's page as the merchant sees it. The role and the permissions are ONE edit: a draft held here, shown as a
 * select and boxes, and saved with the admin's save bar (Save and Discard appear when it differs from what is saved).
 * Letting someone in, restoring them and removing them are acts, sent at once. The route above only loads and answers.
 */
export function MemberDetailView({ member, roles, policy, canChangePlan, result: actionData }: MemberDetailViewProps) {
  const { t } = useTranslation("admin");
  const nameOf = useDisplayName();
  const { pending, send, act } = useMemberActions(member.id);
  const access = useAccessDraft(member, policy);

  const error = actionData && "error" in actionData ? actionData.error : undefined;
  const success = actionData && "success" in actionData ? actionData.success : undefined;
  // Every create/update gets a toast, and the control that sent it shows progress (@rules/polaris-app-home.md §5a).
  useActionToast(actionData, error ? { error: t(ERROR_TEXT[error]) } : success ? { success: t(SUCCESS_TEXT[success]) } : undefined);

  // The removal's modal stays up while the request is in flight (its button shows progress) and goes away when the result is known.
  const removing = pending?.startsWith("remove:") === true;
  const navigate = useNavigate();
  const cancelled = success === "invitationCancelled";
  useEffect(() => {
    if (actionData) void globalThis.shopify.modal.hide(REMOVE_MODAL_ID);
  }, [actionData]);
  // A cancelled invitation is deleted, so its own page no longer exists (the route skips reloading it): go back to the team.
  useEffect(() => {
    if (cancelled) void navigate(paths.members());
  }, [cancelled, actionData, navigate]);

  return (
    <Form method="post">
      <AccessFields memberId={member.id} submission={access.submission} />
      <s-page heading={nameOf(member)} inlineSize="base">
        <s-link slot="breadcrumb-actions" href={paths.members()}>
          {t("members.heading")}
        </s-link>
        {member.can.remove && (
          <s-button slot="secondary-actions" tone="critical" loading={removing} commandFor={REMOVE_MODAL_ID} command="--show">
            {member.isInvitation ? t("members.actions.cancelInvitation") : t("members.actions.remove")}
          </s-button>
        )}
        {error && (
          <s-banner slot="supplemental-start" tone="critical">
            {t(ERROR_TEXT[error])}
          </s-banner>
        )}

        <ProfileSection member={member} />
        <AccessSection member={member} roles={roles} canChangePlan={canChangePlan} role={access.draft.role} custom={!access.isPreset} onChoose={access.choose} onUsePreset={access.usePreset} pending={pending} onAct={act} />
        {/* Only someone who can use the app has permissions to show: for anyone else the access section says why they cannot. */}
        {member.status === "active" && (
          <PermissionsSection
            name={nameOf(member)}
            ticked={access.draft.permissions}
            canEdit={member.customize.allowed}
            editable={access.rules.editable}
            grantable={member.customize.grantable}
            roleOnly={policy.protected}
            onTick={access.tick}
          />
        )}
        <s-box slot="aside">
          <MemberFacts member={member} />
        </s-box>

        {member.can.remove && (
          <RemoveModal
            member={member}
            busy={removing}
            onConfirm={() => send({ intent: "remove" })}
          />
        )}
      </s-page>
      {(member.can.changeRole && !member.can.approve) && (
        <RouteSaveBar id="member-access-save-bar" result={actionData} refused={error !== undefined} dirty={access.changed} onDiscard={access.discard} />
      )}
    </Form>
  );
}

