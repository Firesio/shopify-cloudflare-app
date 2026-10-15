import type { ReactNode } from "react";
import { Alert, AlertDescription } from "~/internal/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader } from "~/internal/components/ui/card";
import { Field, FieldLabel } from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import { AppMark, THEME_INIT_SCRIPT } from "~/internal/components";
import { identity } from "~/identity";

/** Centered card frame shared by the signed-out console pages. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <div className="grid min-h-dvh place-items-center bg-muted/40 p-6">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex items-center justify-center gap-2">
            <AppMark className="size-7" />
            <span className="text-lg font-semibold">{identity.brandName}</span>
          </div>
          <Card>
            <CardHeader className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <CardDescription>{subtitle}</CardDescription>}
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export function ErrorAlert({ message }: { readonly message: string }) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function EmailField() {
  return (
    <Field>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus
      />
    </Field>
  );
}
