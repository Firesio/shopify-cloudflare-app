import { useState } from "react";
import { Form } from "react-router";
import { CircleAlert, Eye, EyeOff, UserPlus } from "lucide-react";
import { Alert, AlertDescription } from "~/internal/components/ui/alert";
import { Button } from "~/internal/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/internal/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "~/internal/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/internal/components/ui/select";
import { Spinner } from "~/internal/components/ui/spinner";
import { MIN_PASSWORD_LENGTH } from "~/lib/password-policy";

function PasswordField() {
  const [shown, setShown] = useState(false);
  return (
    <Field>
      <FieldLabel htmlFor="new-password">Temporary password</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id="new-password"
          name="password"
          type={shown ? "text" : "password"}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
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
      <FieldDescription>
        At least {MIN_PASSWORD_LENGTH} characters. Ask them to change it after signing in.
      </FieldDescription>
    </Field>
  );
}

function RoleField() {
  return (
    <Field>
      <FieldLabel htmlFor="new-role">Role</FieldLabel>
      <Select name="role" defaultValue="admin">
        <SelectTrigger id="new-role" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="owner">Owner</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * Creating an admin is rare, so the form lives behind a button. The page keeps
 * the dialog open while a submission is in flight and when the action reports an
 * error (shown inline here, so the staff member never has to hunt for it), and
 * closes it once the action succeeds.
 */
export function AddAdminDialog({
  open,
  onOpenChange,
  busy,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  loading: boolean;
  error: string | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={busy}>
          <UserPlus />
          Add admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" className="grid gap-4">
          <input type="hidden" name="intent" value="create" />
          <DialogHeader>
            <DialogTitle>Add an admin</DialogTitle>
            <DialogDescription>They can sign in to this console as soon as the account exists.</DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-name">Name</FieldLabel>
              <Input id="new-name" name="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-email">Email</FieldLabel>
              <Input id="new-email" name="email" type="email" required />
            </Field>
            <PasswordField />
            <RoleField />
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {loading && <Spinner />}
              Add admin
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
