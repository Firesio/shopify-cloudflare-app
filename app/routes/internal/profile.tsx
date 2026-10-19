import { useState } from "react";
import { data, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Profile · Staff Console" },
];
import { useActionToast } from "~/internal/use-action-toast";
import { requireAdminUser } from "~/services/admin-auth.server";
import {
  changeOwnPassword,
  updateOwnProfile,
} from "~/services/admin-management.server";
import type { ProfileErrorReason } from "~/services/admin-management.server";
import { MIN_PASSWORD_LENGTH } from "~/lib/password-policy";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Locale } from "~/i18n/config";
import { adminUsers, adminSessionUsers, appRuntime, staffAudit, staffMfa } from "~/wiring.server";
import { mfaStatus, pendingMfaSetup } from "~/services/staff-mfa";
import { handleProfileMfaIntent, isMfaIntent } from "./profile-mfa.server";
import { MfaCard, MFA_ERRORS, MFA_SUCCESS, type MfaResult } from "./profile-mfa";
import {
  AccountCard,
  PasswordCard,
  ProfileSuccess,
  type ProfileDialog,
} from "./profile-forms";

const LOCALE: Locale = "en";

const PROFILE_ERRORS: Record<ProfileErrorReason, string> = {
  nameRequired: "A name is required.",
  wrongPassword: "Your current password is not correct.",
  mismatch: "The new passwords do not match.",
  tooShort: `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  sameAsOld: "The new password must be different from the current one.",
  notFound: "That account no longer exists.",
};

const PROFILE_SUCCESS: Record<SuccessKey, string> = {
  detailsSaved: "Your details were saved.",
  passwordChanged: "Your password was changed.",
};

/** Which dialog an error belongs to, so a failed submit reopens the right one. */
const DIALOG_FOR_ERROR: Record<ProfileErrorReason, ProfileDialog> = {
  nameRequired: "details",
  notFound: "details",
  wrongPassword: "password",
  mismatch: "password",
  tooShort: "password",
  sameAsOld: "password",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireAdminUser(request, { users: adminSessionUsers() });
  const mfa = await staffMfa();
  return { user, mfa: await mfaStatus(user.id, mfa), pendingSetup: await pendingMfaSetup(user, mfa) };
};

type SuccessKey = "detailsSaved" | "passwordChanged";

export const action = async ({ request }: ActionFunctionArgs) => {
  const users = adminUsers();
  const user = await requireAdminUser(request, { users });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "details") {
    const detailsSaved: SuccessKey = "detailsSaved";
    const result = await updateOwnProfile({
      userId: user.id,
      name: String(form.get("name") ?? ""),
    }, { users, runtime: appRuntime() });
    return result.ok
      ? data({ success: detailsSaved })
      : data({ error: result.reason }, { status: 400 });
  }

  if (intent === "password") {
    const passwordChanged: SuccessKey = "passwordChanged";
    const result = await changeOwnPassword({
      userId: user.id,
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword: String(form.get("newPassword") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
    }, { users, runtime: appRuntime() });
    return result.ok
      ? data({ success: passwordChanged })
      : data({ error: result.reason }, { status: 400 });
  }

  if (isMfaIntent(intent)) {
    return handleProfileMfaIntent(intent, user, form, { mfa: await staffMfa(), audit: staffAudit() });
  }

  const notFound: ProfileErrorReason = "notFound";
  return data({ error: notFound }, { status: 400 });
};

export default function Profile() {
  const { user, mfa, pendingSetup } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const submittingIntent = navigation.formData?.get("intent");
  const busyDetails = submittingIntent === "details";
  const busyPassword = submittingIntent === "password";
  const errorReason =
    actionData && "error" in actionData && actionData.error ? actionData.error : undefined;
  const errorMessage = errorReason ? PROFILE_ERRORS[errorReason] : undefined;
  const successMessage =
    actionData && "success" in actionData && actionData.success
      ? PROFILE_SUCCESS[actionData.success]
      : undefined;

  // A new action result decides the dialogs once: an error reopens the dialog
  // it belongs to, a success closes whichever was open.
  const [openDialog, setOpenDialog] = useState<ProfileDialog | null>(null);
  const [seenResult, setSeenResult] = useState(actionData);
  if (actionData !== seenResult) {
    setSeenResult(actionData);
    setOpenDialog(errorReason ? DIALOG_FOR_ERROR[errorReason] : null);
  }
  const mfaResult: MfaResult | undefined =
    actionData && ("mfa" in actionData || "mfaError" in actionData) ? actionData : undefined;
  useActionToast(actionData, {
    error: errorMessage ?? (mfaResult && "mfaError" in mfaResult ? MFA_ERRORS[mfaResult.mfaError] : undefined),
    success: successMessage ?? (mfaResult && "mfa" in mfaResult ? MFA_SUCCESS[mfaResult.mfa] : undefined),
  });

  const errorFor = (dialog: ProfileDialog) =>
    errorReason && DIALOG_FOR_ERROR[errorReason] === dialog ? errorMessage : undefined;
  const controlFor = (dialog: ProfileDialog) => ({
    open: openDialog === dialog,
    onOpenChange: (open: boolean) => setOpenDialog(open ? dialog : null),
  });

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-col gap-4 px-4 md:gap-6 lg:px-6">
        <ProfileSuccess message={successMessage} />
        <AccountCard
          user={user}
          lastSignIn={user.lastLoginAt ? formatDateTime(LOCALE, user.lastLoginAt, UTC) : undefined}
          busy={busyDetails}
          error={errorFor("details")}
          {...controlFor("details")}
        />
        <PasswordCard
          busy={busyPassword}
          error={errorFor("password")}
          {...controlFor("password")}
        />
        <MfaCard
          status={mfa}
          pendingSetup={pendingSetup}
          result={mfaResult}
          busyIntent={typeof submittingIntent === "string" ? submittingIntent : undefined}
          enabledOn={mfa.enabledAt ? formatDateTime(LOCALE, mfa.enabledAt, UTC) : undefined}
        />
      </div>
    </div>
  );
}
