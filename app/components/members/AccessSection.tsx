import { useTranslation } from "react-i18next";
import type { MemberRole } from "~/domain/member-access";
import type { MemberDetail } from "~/domain/member-team";
import { ROLE_TEXT } from "./role-text";

interface AccessSectionProps {
  readonly member: Pick<MemberDetail, "role" | "isYou" | "can">;
  /** The roles the person looking may hand out. */
  readonly roles: readonly MemberRole[];
  /** The role in the select now: what is being edited, not what is saved. */
  readonly role: MemberRole;
  /** The ticks are not the role's preset: the member would have permissions of their own. */
  readonly custom: boolean;
  readonly onChoose: (role: MemberRole) => void;
  readonly onUsePreset: () => void;
  /** `intent:role` of the request in flight, so only the button that sent it shows progress. */
  readonly pending: string | undefined;
  /** Let a waiting person in, or restore a removed one, as a role. These are acts, sent at once. */
  readonly onAct: (intent: "approve" | "restore", role: MemberRole) => void;
}

/** One button per role for the two acts that give someone access: waiting people are let in, removed people restored. */
function ActButtons({ intent, roles, pending, onAct }: { readonly intent: "approve" | "restore"; readonly roles: readonly MemberRole[]; readonly pending: string | undefined; readonly onAct: AccessSectionProps["onAct"] }) {
  const { t } = useTranslation("admin");
  return (
    <s-stack direction="inline" gap="small-200">
      {roles.map((role) => (
        <s-button key={role} loading={pending === `${intent}:${role}`} onClick={() => onAct(intent, role)}>
          {t(`members.actions.${intent}`, { role: t(ROLE_TEXT[role].label) })}
        </s-button>
      ))}
    </s-stack>
  );
}

/** The role as a select, with what it allows, and, when the ticks below are no longer its preset, a way back to it. */
function RoleSelect({ roles, role, custom, onChoose, onUsePreset }: Pick<AccessSectionProps, "roles" | "role" | "custom" | "onChoose" | "onUsePreset">) {
  const { t } = useTranslation("admin");
  const roleName = t(ROLE_TEXT[role].label);
  return (
    <s-stack gap="base">
      <s-select
        label={t("members.detail.roleLabel")}
        value={role}
        details={t(ROLE_TEXT[role].description)}
        onChange={(event) => {
          const chosen = roles.find((each) => each === event.currentTarget.value);
          if (chosen !== undefined) onChoose(chosen);
        }}
      >
        {roles.map((each) => (
          <s-option key={each} value={each} selected={each === role}>
            {t(ROLE_TEXT[each].label)}
          </s-option>
        ))}
      </s-select>
      {custom && (
        <s-stack gap="small-200">
          <s-text type="strong">{t("members.detail.customLabel")}</s-text>
          <s-paragraph color="subdued">{t("members.detail.basedOn", { role: roleName })}</s-paragraph>
          <s-stack direction="inline">
            <s-button variant="tertiary" onClick={onUsePreset}>
              {t("members.detail.usePreset", { role: roleName })}
            </s-button>
          </s-stack>
        </s-stack>
      )}
    </s-stack>
  );
}

/**
 * Who this member is to the app. What the looker may do decides what shows: a waiting person is let in as a role, a removed
 * one restored as a role; anyone the looker may change gets the role as a select, saved with the page's save bar; anyone
 * else, the role as plain words and why it cannot be changed.
 */
export function AccessSection(props: AccessSectionProps) {
  const { t } = useTranslation("admin");
  const { member, roles, pending, onAct } = props;
  const { can } = member;
  return (
    <s-section heading={t("members.detail.accessHeading")}>
      {can.approve && <ActButtons intent="approve" roles={roles} pending={pending} onAct={onAct} />}
      {can.restore && <ActButtons intent="restore" roles={roles} pending={pending} onAct={onAct} />}
      {can.changeRole && !can.approve && <RoleSelect roles={roles} role={props.role} custom={props.custom} onChoose={props.onChoose} onUsePreset={props.onUsePreset} />}
      {!can.changeRole && !can.restore && (
        <s-stack gap="small-200">
          <s-text type="strong">{t(ROLE_TEXT[member.role].label)}</s-text>
          <s-paragraph color="subdued">{t(ROLE_TEXT[member.role].description)}</s-paragraph>
          <s-paragraph>{member.isYou ? t("members.detail.isYou") : t("members.detail.notChangeable")}</s-paragraph>
        </s-stack>
      )}
    </s-section>
  );
}
