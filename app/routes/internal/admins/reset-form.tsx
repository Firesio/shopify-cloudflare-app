import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/internal/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "~/internal/components/ui/input-group";
import { Spinner } from "~/internal/components/ui/spinner";
import { MIN_PASSWORD_LENGTH } from "~/lib/password-policy";

/** A password input with a show/hide toggle; used for both the new password and its confirmation. */
function PasswordField({
  id,
  label,
  description,
  autoFocus = false,
}: {
  id: "newPassword" | "confirmPassword";
  label: string;
  description?: string;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          name={id}
          type={shown ? "text" : "password"}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          autoFocus={autoFocus}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            onClick={() => setShown((value) => !value)}
          >
            {shown ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

export function ResetPasswordCard({ name, busy }: { name: string; busy: boolean }) {
  // Only this form's own submission spins its button, not any navigation.
  const submitting = useNavigation().state === "submitting";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{`Reset the password for ${name}?`}</CardTitle>
        <CardDescription>
          Set a new password and give it to them directly. Their current password stops working immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="flex flex-col gap-6">
          <FieldGroup>
            <PasswordField
              id="newPassword"
              label="New password"
              description={`At least ${MIN_PASSWORD_LENGTH} characters. Ask them to change it after signing in.`}
              autoFocus
            />
            <PasswordField id="confirmPassword" label="Confirm new password" />
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {submitting && <Spinner />}
              Reset password
            </Button>
            <Button asChild variant="outline">
              <Link to="/internal/admins">Cancel</Link>
            </Button>
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}
