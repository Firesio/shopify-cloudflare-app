import { Form, Link } from "react-router";
import { Alert, AlertDescription } from "~/internal/components/ui/alert";
import { Button } from "~/internal/components/ui/button";
import { Spinner } from "~/internal/components/ui/spinner";
import { FieldGroup } from "~/internal/components/ui/field";
import { paths } from "~/urls";
import { EmailField } from "./auth-shell";

export function ForgotPasswordForm({ submitting }: { readonly submitting: boolean }) {
  return (
    <Form method="post">
      <FieldGroup className="gap-4">
        <EmailField />
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
      </FieldGroup>
    </Form>
  );
}

export function ForgotPasswordSent({ devToken }: { readonly devToken?: string | undefined }) {
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          If an account exists for that address, a reset link is on
          its way. The link expires in one hour.
        </AlertDescription>
      </Alert>

      {/* Local development only: the service returns the token when
          email is not configured AND the deployment is not production.
          It is never returned from a real deployment. */}
      {devToken && (
        <Alert>
          <AlertDescription className="break-all">
            Email is not configured locally, so here is the link:{" "}
            <Link to={paths.internal.resetPassword(devToken)} className="underline">
              /internal/reset-password/{devToken}
            </Link>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function BackToSignIn() {
  return (
    <div className="mt-4 flex justify-center">
      <Button asChild variant="link" size="sm" className="text-muted-foreground">
        <Link to="/internal/login">Back to sign in</Link>
      </Button>
    </div>
  );
}
