import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemberRole } from "~/domain/member-access";
import type { MemberDetail } from "~/domain/member-team";
import { paths } from "~/urls";
import { useDisplayName } from "./member-display";
import { ROLE_TEXT } from "./role-text";

interface AccessSectionProps {
  readonly member: Pick<MemberDetail, "id" | "name" | "email" | "role" | "status" | "isYou" | "isInvitation" | "noSeat" | "can" | "seat">;
  /** The roles the person looking may hand out. */
  readonly roles: readonly MemberRole[];
  /** The role in the select now: what is being edited, not what is saved. */
  readonly role: MemberRole;
  /** The ticks are not the role's preset: the member would have permissions of their own. */
  readonly custom: boolean;
  /** The looker may change the plan, so a full-seats note can link to it. */
  readonly canChangePlan: boolean;
  readonly onChoose: (role: MemberRole) => void;
  readonly onUsePreset: () => void;
  /** `intent:role` of the request in flight, so only the button that sent it shows progress. */
  readonly pending: string | undefined;
  /** Let a waiting person in, or restore a removed one, as a role. These are acts, sent at once. */
  readonly onAct: (intent: "approve" | "restore", role: MemberRole) => void;
}

/** One role select with what the role allows. The caller decides what choosing does. */
function RoleField({ roles, role, onPick }: { readonly roles: readonly MemberRole[]; readonly role: MemberRole; readonly onPick: (role: MemberRole) => void }) {
  const { t } = useTranslation("admin");
  return (
    <s-select
      label={t("members.detail.roleLabel")}
      value={role}
      details={t(ROLE_TEXT[role].description)}
      onChange={(event) => {
        const chosen = roles.find((each) => each === event.currentTarget.value);
        if (chosen !== undefined) onPick(chosen);
      }}
    >
      {roles.map((each) => (
        <s-option key={each} value={each} selected={each === role}>
          {t(ROLE_TEXT[each].label)}
        </s-option>
      ))}
    </s-select>
  );
}

/**
 * Letting a waiting person in, or bringing a removed one back: ONE role to choose and ONE button, however many roles there
 * are. When the plan has no free seat the button is disabled and the reason sits beside it, with a way to the plan.
 */
function LetIn({ member, roles, pending, canChangePlan, onAct }: Pick<AccessSectionProps, "member" | "roles" | "pending" | "canChangePlan" | "onAct">) {
  const { t } = useTranslation("admin");
  const intent = member.can.approve ? "approve" : "restore";
  const [chosen, setChosen] = useState<MemberRole>(roles.find((each) => each === member.role) ?? roles[0] ?? member.role);
  const seat = member.seat;
  const blocked = seat !== null && !seat.open;
  return (
    <s-stack gap="base">
      <RoleField roles={roles} role={chosen} onPick={setChosen} />
      {blocked && (
        <s-banner tone="warning">
          <s-stack gap="small-200">
            <s-text>{t(seat.why === "full" ? "members.detail.seatFull" : "members.detail.seatUnreadable")}</s-text>
            {canChangePlan && <s-link href={paths.billing()}>{t("members.seats.changePlan")}</s-link>}
          </s-stack>
        </s-banner>
      )}
      <s-stack direction="inline">
        <s-button variant="primary" disabled={blocked} loading={pending === `${intent}:${chosen}`} onClick={() => onAct(intent, chosen)}>
          {t(`members.actions.${intent}`, { role: t(ROLE_TEXT[chosen].label) })}
        </s-button>
      </s-stack>
    </s-stack>
  );
}

/** The role as a select, with what it allows, and, when the ticks below are no longer its preset, a way back to it. */
function RoleSelect({ roles, role, custom, onChoose, onUsePreset }: Pick<AccessSectionProps, "roles" | "role" | "custom" | "onChoose" | "onUsePreset">) {
  const { t } = useTranslation("admin");
  const roleName = t(ROLE_TEXT[role].label);
  return (
    <s-stack gap="base">
      <RoleField roles={roles} role={role} onPick={onChoose} />
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

/** Says where this person stands when they cannot use the app (an invitation, waiting, no seat, removed); null for an active one. */
function StateNote({ member }: { readonly member: AccessSectionProps["member"] }) {
  const { t } = useTranslation("admin");
  const nameOf = useDisplayName();
  const name = nameOf(member);
  if (member.isInvitation) return <s-paragraph color="subdued">{t("members.detail.state.invited")}</s-paragraph>;
  if (member.noSeat) return <s-paragraph color="subdued">{t("members.detail.state.noSeat", { name })}</s-paragraph>;
  if (member.status === "pending") return <s-paragraph color="subdued">{t("members.detail.state.waiting", { name })}</s-paragraph>;
  if (member.status === "removed") return <s-paragraph color="subdued">{t("members.detail.state.removed", { name })}</s-paragraph>;
  return null;
}

/**
 * Who this member is to the app. What the looker may do decides what shows: a waiting or lost-seat person is let in as a role
 * and a removed one restored as a role (one select, one button); anyone the looker may change gets the role as a select, saved
 * with the page's save bar; anyone else, the role as plain words and why it cannot be changed. A person who cannot use the
 * app is told why first.
 */
export function AccessSection(props: AccessSectionProps) {
  const { t } = useTranslation("admin");
  const { member, roles, canChangePlan, pending, onAct } = props;
  const { can } = member;
  const letIn = can.approve || can.restore;
  return (
    <s-section heading={t("members.detail.accessHeading")}>
      <s-stack gap="base">
        <StateNote member={member} />
        {letIn && <LetIn key={member.id} member={member} roles={roles} pending={pending} canChangePlan={canChangePlan} onAct={onAct} />}
        {can.changeRole && !letIn && <RoleSelect roles={roles} role={props.role} custom={props.custom} onChoose={props.onChoose} onUsePreset={props.onUsePreset} />}
        {!can.changeRole && !letIn && (
          <s-stack gap="small-200">
            <s-text type="strong">{t(ROLE_TEXT[member.role].label)}</s-text>
            <s-paragraph color="subdued">{t(ROLE_TEXT[member.role].description)}</s-paragraph>
            <s-paragraph>{member.isYou ? t("members.detail.isYou") : t("members.detail.notChangeable")}</s-paragraph>
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}
