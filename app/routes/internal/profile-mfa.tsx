import { Form } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "~/internal/components/ui/alert";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import { Spinner } from "~/internal/components/ui/spinner";
import type { MfaFailure, MfaSetup, MfaStatus } from "~/services/staff-mfa";
import type { MfaIntent } from "./profile-mfa.server";

export const MFA_ERRORS: Record<MfaFailure, string> = {
  unavailable: "Two-step verification is not configured on this deployment (the STAFF_MFA_KEY secret is missing or changed).",
  alreadyEnabled: "Two-step verification is already on.",
  notEnabled: "Two-step verification is not on.",
  noPendingSetup: "That setup expired. Start again to get a new key.",
  invalidCode: "That code is not valid. Codes change every 30 seconds and work once.",
};

export const MFA_SUCCESS = {
  started: "Add the key to your authenticator app, then enter a code to finish.",
  enabled: "Two-step verification is on. Save your recovery codes now.",
  disabled: "Two-step verification is off.",
  regenerated: "New recovery codes created. The old ones no longer work.",
} as const;

export type MfaResult =
  | { readonly mfa: "started" | "disabled" }
  | { readonly mfa: "enabled" | "regenerated"; readonly recoveryCodes: readonly string[] }
  | { readonly mfaError: MfaFailure };

function CodeField({ id, error, autoFocus }: { id: string; error: string | undefined; autoFocus?: boolean }) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Code</FieldLabel>
      <Input
        id={id}
        name="code"
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        required
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
      />
      <FieldDescription>The 6-digit code from your authenticator app, or a recovery code.</FieldDescription>
    </Field>
  );
}

function SubmitButton({ busy, label, variant }: { busy: boolean; label: string; variant?: "destructive" }) {
  return (
    <Button type="submit" disabled={busy} variant={variant}>
      {busy && <Spinner />}
      {label}
    </Button>
  );
}

/** The codes are shown once, right after they are created; only their hashes are stored. */
function RecoveryCodes({ codes }: { codes: readonly string[] }) {
  return (
    <Alert>
      <AlertTitle>Recovery codes</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>Each code signs you in once if you lose your phone. Store them somewhere safe: they are not shown again.</span>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm tabular-nums">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function PendingSetup({ setup, busy, error }: { setup: MfaSetup; busy: boolean; error: string | undefined }) {
  const grouped = setup.secret.match(/.{1,4}/g)?.join(" ") ?? setup.secret;
  return (
    <Form method="post" className="flex flex-col gap-4">
      <input type="hidden" name="intent" value={"mfa-confirm" satisfies MfaIntent} />
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>
          In your authenticator app, add an account with this key (time-based):
          <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-sm">{grouped}</code>
          On a phone you can <a className="underline underline-offset-4" href={setup.uri}>open it in the app</a> instead.
        </li>
        <li>Enter the code the app shows.</li>
      </ol>
      <FieldGroup className="gap-4">
        {error && <FieldError>{error}</FieldError>}
        <CodeField id="mfa-confirm-code" error={error} autoFocus />
      </FieldGroup>
      <div>
        <SubmitButton busy={busy} label="Turn on" />
      </div>
    </Form>
  );
}

function CodeDialog({
  intent,
  trigger,
  title,
  description,
  submitLabel,
  busy,
  error,
  destructive,
}: {
  intent: MfaIntent;
  trigger: string;
  title: string;
  description: string;
  submitLabel: string;
  busy: boolean;
  error: string | undefined;
  destructive?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{trigger}</Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" className="flex flex-col gap-6">
          <input type="hidden" name="intent" value={intent} />
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            {error && <FieldError>{error}</FieldError>}
            <CodeField id={`${intent}-code`} error={error} autoFocus />
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <SubmitButton busy={busy} label={submitLabel} variant={destructive ? "destructive" : undefined} />
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function resultKey(result: MfaResult | undefined): string {
  if (!result) return "none";
  return "mfaError" in result ? `error:${result.mfaError}` : result.mfa;
}

function EnabledControls({
  status,
  enabledOn,
  error,
  resultKey: key,
  busy,
}: {
  status: MfaStatus;
  enabledOn: string | undefined;
  error: string | undefined;
  resultKey: string;
  busy: (intent: MfaIntent) => boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {enabledOn && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">On since</span>
            <span className="tabular-nums">{enabledOn}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Recovery codes left</span>
          <span className="tabular-nums">{status.recoveryCodesLeft}</span>
        </div>
      </div>
      {error && <FieldError>{error}</FieldError>}
      {/* Keyed by the last result, so a finished submission remounts the dialogs closed. */}
      <div className="flex flex-wrap gap-2" key={key}>
        <CodeDialog
          intent="mfa-regenerate"
          trigger="New recovery codes"
          title="Create new recovery codes"
          description="Your current recovery codes stop working. Confirm with a code."
          submitLabel="Create codes"
          busy={busy("mfa-regenerate")}
          error={error}
        />
        <CodeDialog
          intent="mfa-disable"
          trigger="Turn off"
          title="Turn off two-step verification"
          description="Your password alone will sign you in again. Confirm with a code."
          submitLabel="Turn off"
          busy={busy("mfa-disable")}
          error={error}
          destructive
        />
      </div>
    </>
  );
}

export function MfaCard({
  status,
  pendingSetup,
  result,
  busyIntent,
  enabledOn,
}: {
  status: MfaStatus;
  pendingSetup: MfaSetup | null;
  result: MfaResult | undefined;
  busyIntent: string | undefined;
  /** `status.enabledAt`, already formatted. */
  enabledOn: string | undefined;
}) {
  const error = result && "mfaError" in result ? MFA_ERRORS[result.mfaError] : undefined;
  const codes = result && "recoveryCodes" in result ? result.recoveryCodes : undefined;
  const busy = (intent: MfaIntent) => busyIntent === intent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-step verification</CardTitle>
        <CardDescription>
          A code from an authenticator app at every sign-in, so a leaked password alone cannot open the console.
        </CardDescription>
        <CardAction>
          <Badge variant={status.enabled ? "default" : "secondary"}>{status.enabled ? "On" : "Off"}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {codes && <RecoveryCodes codes={codes} />}
        {!status.available && !status.enabled && (
          <p className="text-sm text-muted-foreground">{MFA_ERRORS.unavailable}</p>
        )}
        {status.available && !status.enabled && pendingSetup && (
          <PendingSetup setup={pendingSetup} busy={busy("mfa-confirm")} error={error} />
        )}
        {status.available && !status.enabled && !pendingSetup && (
          <Form method="post" className="flex flex-col gap-2">
            <input type="hidden" name="intent" value={"mfa-start" satisfies MfaIntent} />
            {error && <FieldError>{error}</FieldError>}
            <div>
              <SubmitButton busy={busy("mfa-start")} label="Set up two-step verification" />
            </div>
          </Form>
        )}
        {status.enabled && (
          <EnabledControls status={status} enabledOn={enabledOn} error={error} resultKey={resultKey(result)} busy={busy} />
        )}
      </CardContent>
    </Card>
  );
}
