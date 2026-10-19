// Internal staff console: English-only by design (@rules/i18n.md).
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Button } from "~/internal/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import { Spinner } from "~/internal/components/ui/spinner";
import { INTERNAL_FONT_LINKS } from "~/internal/components";
import { isProductionLike } from "~/lib/deployment";
import { getEnv } from "~/request-context.server";
import { completeSignIn, readMfaChallenge } from "~/services/admin-auth.server";
import { paths } from "~/urls";
import { recordStaffEvent } from "~/services/staff-audit";
import { verifySecondFactor } from "~/services/staff-mfa";
import { adminUsers, appRuntime, authLimiters, staffAudit, staffMfa } from "~/wiring.server";
import internalStyles from "~/styles/internal/internal.tailwind.css?url";
import { AuthShell, ErrorAlert } from "../auth-shell";
import { handleMfaAction, type MfaChallengeError } from "./mfa.server";

const ERRORS: Record<MfaChallengeError, string> = {
  missingCode: "Enter the code from your authenticator app, or a recovery code.",
  invalidCode: "That code is not valid. Codes change every 30 seconds and work once.",
  rateLimited: "Too many attempts. Wait a minute and try again.",
  unavailable: "Two-step verification is unavailable right now. Ask an owner to check the STAFF_MFA_KEY secret.",
};

export const links: LinksFunction = () => [...INTERNAL_FONT_LINKS, { rel: "stylesheet", href: internalStyles }];

export const meta: MetaFunction = () => [
  { title: "Two-step verification" },
  { name: "robots", content: "noindex, nofollow" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!(await readMfaChallenge(request, appRuntime().clock.now()))) throw redirect(paths.internal.login());
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const mfa = await staffMfa();
  const users = adminUsers();
  const audit = staffAudit();
  return handleMfaAction(request, {
    limiter: authLimiters().login,
    productionLike: isProductionLike(getEnv().SHOPIFY_APP_URL ?? ""),
    readChallenge: (incoming) => readMfaChallenge(incoming, appRuntime().clock.now()),
    findUser: (id) => users.findById(id),
    verify: (id, code) => verifySecondFactor(id, code, mfa),
    recordFailure: (user) => recordStaffEvent("mfa_challenge_failed", user, audit),
    recordRecoveryCodeUse: (user) => recordStaffEvent("recovery_code_used", user, audit),
    completeSignIn,
  });
};

export default function MfaChallenge() {
  const actionData = useActionData<typeof action>();
  const submitting = useNavigation().state !== "idle";
  const error = actionData?.error;

  return (
    <AuthShell
      title="Two-step verification"
      subtitle={<p className="mt-1 text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>}
    >
      {error && <ErrorAlert message={ERRORS[error]} />}
      <Form method="post">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="code">Code</FieldLabel>
            <Input id="code" name="code" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required autoFocus />
            <FieldDescription>Lost your phone? Enter one of your recovery codes instead.</FieldDescription>
          </Field>
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? "Verifying…" : "Verify"}
          </Button>
        </FieldGroup>
      </Form>
      <div className="mt-4 flex justify-center">
        <Button asChild variant="link" size="sm" className="text-muted-foreground">
          <Link to={paths.internal.login()}>Back to sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
