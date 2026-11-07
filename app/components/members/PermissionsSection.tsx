import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MEMBER_PERMISSIONS, type MemberPermission } from "~/domain/member-access";
import { FLOOR_PERMISSION } from "~/domain/member-permissions";
import { PERMISSION_TEXT } from "./permission-text";

interface PermissionsSectionProps {
  /** Whose permissions these are, for the sentence above them. */
  readonly name: string;
  /** What they hold right now. */
  readonly held: readonly MemberPermission[];
  /** The looker may give this member a set of their own. Otherwise the list is only shown. */
  readonly editable: boolean;
  /** What the looker may tick. */
  readonly grantable: readonly MemberPermission[];
  /** What only comes with a role in this app, so it is never ticked one by one. */
  readonly roleOnly: readonly MemberPermission[];
  readonly busy: boolean;
  readonly onSave: (permissions: readonly MemberPermission[]) => void;
}

/** What the editor starts from: the way in, and what this member holds that the looker may give. Nothing the looker cannot save. */
function startingSet(held: readonly MemberPermission[], grantable: readonly MemberPermission[]): readonly MemberPermission[] {
  return MEMBER_PERMISSIONS.filter((permission) => permission === FLOOR_PERMISSION || (held.includes(permission) && grantable.includes(permission)));
}

const sameSet = (a: readonly MemberPermission[], b: readonly MemberPermission[]): boolean => a.length === b.length && a.every((permission) => b.includes(permission));

/**
 * Every permission the app has, as a checkbox: ticked for what the member holds. Read-only unless the looker may give this
 * member a set of their own; then the way in is locked on, what only comes with a role (or that the looker lacks) is locked
 * as it is, and saving is held back until something changes.
 *
 * The draft starts from props, so the page gives this component a `key` that changes when what is saved changes: the
 * draft then starts over from the new truth, and a refused save keeps what was typed.
 */
export function PermissionsSection({ name, held, editable, grantable, roleOnly, busy, onSave }: PermissionsSectionProps) {
  const { t } = useTranslation("admin");
  const initial = startingSet(held, grantable);
  const [draft, setDraft] = useState<readonly MemberPermission[]>(initial);
  const changed = !sameSet(draft, initial);

  const lockedBecause = (permission: MemberPermission): "role" | "yours" | "floor" | null => {
    if (!editable) return null;
    if (roleOnly.includes(permission)) return "role";
    if (permission === FLOOR_PERMISSION) return "floor";
    return grantable.includes(permission) ? null : "yours";
  };
  const toggle = (permission: MemberPermission, on: boolean) => setDraft(MEMBER_PERMISSIONS.filter((each) => (each === permission ? on : draft.includes(each))));

  return (
    <s-section heading={t("members.detail.permissionsHeading")}>
      <s-stack gap="base">
        <s-paragraph color="subdued">{t(editable ? "members.detail.permissionsEditable" : "members.detail.permissionsReadOnly", { name })}</s-paragraph>
        <s-stack gap="small-200">
          {MEMBER_PERMISSIONS.map((permission) => {
            const reason = lockedBecause(permission);
            const hint = reason === "role" ? t("members.detail.roleOnlyHint") : reason === "yours" ? t("members.detail.notYoursHint") : "";
            // The draft being made is shown for what the looker is choosing, the way in included; everything else shows the truth about this member.
            const ticked = editable && reason !== "role" && reason !== "yours" ? draft.includes(permission) : held.includes(permission);
            return (
              <s-checkbox
                key={permission}
                label={t(PERMISSION_TEXT[permission].label)}
                details={`${t(PERMISSION_TEXT[permission].description)} ${hint}`.trim()}
                checked={ticked}
                disabled={!editable || reason !== null}
                onChange={(event) => toggle(permission, event.currentTarget.checked)}
              ></s-checkbox>
            );
          })}
        </s-stack>
        {editable && (
          <>
            <s-paragraph color="subdued">{t("members.detail.customHint")}</s-paragraph>
            <s-stack direction="inline">
              <s-button variant="primary" disabled={!changed} loading={busy} onClick={() => onSave(draft)}>
                {t("members.detail.savePermissions")}
              </s-button>
            </s-stack>
          </>
        )}
      </s-stack>
    </s-section>
  );
}
