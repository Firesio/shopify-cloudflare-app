import { useState } from "react";
import { Form, Link } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "~/internal/components/ui/alert";
import { Button } from "~/internal/components/ui/button";
import { Spinner } from "~/internal/components/ui/spinner";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "~/internal/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "~/internal/components/ui/input-group";
import { MIN_PASSWORD_LENGTH } from "~/lib/password-policy";

const RESET_FIELDS = [
  { id: "newPassword", label: "New password", autoFocus: true },
  { id: "confirmPassword", label: "Confirm new password", autoFocus: false },
] as const;

export function ResetDone() {
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          Your password was changed. You can sign in now.
        </AlertDescription>
      </Alert>
      <Button asChild className="w-full">
        <Link to="/internal/login">Sign in</Link>
      </Button>
    </div>
  );
}

export function RequestNewLink() {
  return (
    <Button asChild variant="outline" className="w-full">
      <Link to="/internal/forgot-password">Request a new link</Link>
    </Button>
  );
}

export function ResetForm({ submitting }: { readonly submitting: boolean }) {
  // One toggle for both fields: people reveal them together to compare.
  const [shown, setShown] = useState(false);

  return (
    <Form method="post">
      <FieldGroup className="gap-4">
        {RESET_FIELDS.map((field) => (
          <Field key={field.id}>
            <FieldLabel htmlFor={field.id}>{field.label}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={field.id}
                name={field.id}
                type={shown ? "text" : "password"}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                autoFocus={field.autoFocus}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={shown ? "Hide passwords" : "Show passwords"}
                  aria-pressed={shown}
                  onClick={() => setShown((value) => !value)}
                >
                  {shown ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        ))}

        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          {submitting ? "Saving…" : "Set password"}
        </Button>
      </FieldGroup>
    </Form>
  );
}
