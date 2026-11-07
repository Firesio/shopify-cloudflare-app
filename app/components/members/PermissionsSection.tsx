import { useTranslation } from "react-i18next";
import { MEMBER_PERMISSIONS, type MemberPermission } from "~/domain/member-access";
import { PERMISSION_TEXT } from "./permission-text";

interface PermissionsSectionProps {
  /** Whose permissions these are, for the sentence above them. */
  readonly name: string;
  /** What is ticked: the draft, which is what the member holds until something is chosen and then follows the role and the boxes at once. */
  readonly ticked: readonly MemberPermission[];
  /** The looker may give this member a set of their own: some permissions below are boxes. */
  readonly canEdit: boolean;
  /** The ones that are boxes. Every other is a plain row. */
  readonly editable: readonly MemberPermission[];
  /** What the looker may give. A permission outside it (and not role-only) is theirs to lack. */
  readonly grantable: readonly MemberPermission[];
  /** What only comes with a role in this app, so it is never ticked one by one. */
  readonly roleOnly: readonly MemberPermission[];
  readonly onTick: (permission: MemberPermission, on: boolean) => void;
}

/**
 * One permission that cannot be changed, as a plain row: an icon for whether it is allowed, its name and what it allows at full
 * strength (a disabled checkbox would fade the very words the merchant is reading), and the reason it is locked when there is one.
 * A screen reader is told in words whether it is allowed.
 */
function StaticPermission({ permission, allowed, hint }: { readonly permission: MemberPermission; readonly allowed: boolean; readonly hint: string }) {
  const { t } = useTranslation("admin");
  return (
    <s-stack direction="inline" gap="small-200" alignItems="start" data-permission={permission} data-allowed={String(allowed)}>
      <s-icon type={allowed ? "check" : "minus"} color={allowed ? "base" : "subdued"} />
      <s-stack gap="none">
        <s-text>
          {t(PERMISSION_TEXT[permission].label)}
          <s-text accessibilityVisibility="exclusive">{allowed ? t("members.detail.allowed") : t("members.detail.notAllowed")}</s-text>
        </s-text>
        <s-text color="subdued">{`${t(PERMISSION_TEXT[permission].description)} ${hint}`.trim()}</s-text>
      </s-stack>
    </s-stack>
  );
}

/**
 * Every permission the app has. The ones the looker may change are checkboxes; the rest (the way in every member has, what
 * only comes with a role, what the looker lacks, or all of them when nothing can be edited) are plain rows with the reason.
 */
export function PermissionsSection({ name, ticked, canEdit, editable, grantable, roleOnly, onTick }: PermissionsSectionProps) {
  const { t } = useTranslation("admin");
  const hintOf = (permission: MemberPermission): string => {
    if (!canEdit) return "";
    if (roleOnly.includes(permission)) return t("members.detail.roleOnlyHint");
    return grantable.includes(permission) ? "" : t("members.detail.notYoursHint");
  };
  return (
    <s-section heading={t("members.detail.permissionsHeading")}>
      <s-stack gap="base">
        <s-paragraph color="subdued">{t(canEdit ? "members.detail.permissionsEditable" : "members.detail.permissionsReadOnly", { name })}</s-paragraph>
        <s-stack gap="base">
          {MEMBER_PERMISSIONS.map((permission) =>
            editable.includes(permission) ? (
              <s-checkbox
                key={permission}
                label={t(PERMISSION_TEXT[permission].label)}
                details={t(PERMISSION_TEXT[permission].description)}
                checked={ticked.includes(permission)}
                onChange={(event) => onTick(permission, event.currentTarget.checked)}
              ></s-checkbox>
            ) : (
              <StaticPermission key={permission} permission={permission} allowed={ticked.includes(permission)} hint={hintOf(permission)} />
            ),
          )}
        </s-stack>
        {canEdit && <s-paragraph color="subdued">{t("members.detail.customHint")}</s-paragraph>}
      </s-stack>
    </s-section>
  );
}
