import { Form, Link } from "react-router";
import { Button } from "~/internal/components/ui/button";
import { Spinner } from "~/internal/components/ui/spinner";
import { FieldGroup, Field, FieldLabel } from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import { EmailField } from "./auth-shell";

export function LoginForm({
  next,
  submitting,
}: {
  readonly next: string;
  readonly submitting: boolean;
}) {
  return (
    <Form method="post">
      <FieldGroup className="gap-4">
        <input type="hidden" name="next" value={next} />
        <EmailField />
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </Form>
  );
}

export function LoginFooter({ showDevHint }: { readonly showDevHint: boolean }) {
  return (
    <>
      <div className="mt-4 flex justify-center">
        <Button asChild variant="link" size="sm" className="text-muted-foreground">
          <Link to="/internal/forgot-password">Forgot your password?</Link>
        </Button>
      </div>

      {showDevHint && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Development seed: admin@localhost / admin123
        </p>
      )}
    </>
  );
}
