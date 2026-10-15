import { useState, type ReactNode } from "react";
import { Form } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "~/internal/components/ui/alert";
import { Avatar, AvatarFallback } from "~/internal/components/ui/avatar";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/internal/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/internal/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "~/internal/components/ui/input-group";
import { Spinner } from "~/internal/components/ui/spinner";
import { MIN_PASSWORD_LENGTH } from "~/lib/password-policy";

/** Which profile dialog is open. */
export type ProfileDialog = "details" | "password";

interface DialogControl {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The inline, no-JS-safe success message; failures render inside their dialog. */
export function ProfileSuccess({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <Alert>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase());
  return letters.join("") || "?";
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <Button type="submit" disabled={busy}>
      {busy && <Spinner />}
      {children}
    </Button>
  );
}

function CancelButton() {
  return (
    <DialogClose asChild>
      <Button type="button" variant="outline">
        Cancel
      </Button>
    </DialogClose>
  );
}

export function AccountCard({
  user,
  lastSignIn,
  busy,
  error,
  open,
  onOpenChange,
}: {
  user: { name: string; email: string; role: "owner" | "admin" };
  lastSignIn: string | undefined;
  busy: boolean;
  error: string | undefined;
} & DialogControl) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback className="text-lg">{initialsOf(user.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="truncate text-xl">{user.name}</CardTitle>
              <CardDescription className="truncate">{user.email}</CardDescription>
            </div>
          </div>
          <CardAction>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Edit details
              </Button>
            </DialogTrigger>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary" className="capitalize">
              {user.role}
            </Badge>
          </div>
          {lastSignIn && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Last sign-in</span>
              <span className="tabular-nums">{lastSignIn}</span>
            </div>
          )}
        </CardContent>
      </Card>
      <DetailsDialogContent user={user} busy={busy} error={error} />
    </Dialog>
  );
}

function DetailsDialogContent({
  user,
  busy,
  error,
}: {
  user: { name: string; email: string };
  busy: boolean;
  error: string | undefined;
}) {
  return (
    <DialogContent>
      <Form method="post" className="flex flex-col gap-6">
        <input type="hidden" name="intent" value="details" />
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>Update how your name appears to the team.</DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          {error && <FieldError>{error}</FieldError>}
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              defaultValue={user.name}
              required
              autoFocus
              aria-invalid={error ? true : undefined}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            {/* Read-only on purpose: changing your own sign-in address is an
                account-takeover vector, so an owner does it for you. */}
            <Input id="email" value={user.email} readOnly disabled />
            <FieldDescription>Ask an owner to change your email address.</FieldDescription>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <CancelButton />
          <SubmitButton busy={busy}>Save</SubmitButton>
        </DialogFooter>
      </Form>
    </DialogContent>
  );
}

function PasswordField({
  id,
  label,
  autoComplete,
  description,
  minLength,
  autoFocus,
}: {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  description?: string;
  minLength?: number;
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
          autoComplete={autoComplete}
          minLength={minLength}
          required
          autoFocus={autoFocus}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={shown}
            onClick={() => setShown((value) => !value)}
          >
            {shown ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}

export function PasswordCard({
  busy,
  error,
  open,
  onOpenChange,
}: {
  busy: boolean;
  error: string | undefined;
} & DialogControl) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Use a password you have not used elsewhere. You will stay signed in on this device.
          </CardDescription>
          <CardAction>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Change password
              </Button>
            </DialogTrigger>
          </CardAction>
        </CardHeader>
      </Card>
      <ChangePasswordDialogContent busy={busy} error={error} />
    </Dialog>
  );
}

function ChangePasswordDialogContent({
  busy,
  error,
}: {
  busy: boolean;
  error: string | undefined;
}) {
  return (
    <DialogContent>
      <Form method="post" className="flex flex-col gap-6">
        <input type="hidden" name="intent" value="password" />
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Enter your current password, then choose a new one.</DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          {error && <FieldError>{error}</FieldError>}
          {/* Required even though the session proves identity: it stops a
              hijacked session from locking the real owner out. */}
          <PasswordField
            id="currentPassword"
            label="Current password"
            autoComplete="current-password"
            autoFocus
          />
          <PasswordField
            id="newPassword"
            label="New password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          />
          <PasswordField
            id="confirmPassword"
            label="Confirm new password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
        </FieldGroup>

        <DialogFooter>
          <CancelButton />
          <SubmitButton busy={busy}>Change password</SubmitButton>
        </DialogFooter>
      </Form>
    </DialogContent>
  );
}
