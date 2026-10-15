import {
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Reset Admin Password · Staff Console" },
];
import { CircleAlert, UserX } from "lucide-react";
import { Alert, AlertDescription } from "~/internal/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/internal/components/ui/breadcrumb";
import { Card, CardContent, CardHeader } from "~/internal/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/internal/components/ui/empty";
import { Skeleton } from "~/internal/components/ui/skeleton";
import { requireOwner } from "~/services/admin-auth.server";
import { adminUsers, appRuntime } from "~/wiring.server";
import {
  resetAdminPassword,
  type AdminErrorReason,
} from "~/services/admin-management.server";
import { ADMIN_ERRORS } from "~/internal/admin-messages";
import { Deferred } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { ResetPasswordCard } from "./reset-form";

/**
 * An owner resets another admin's password.
 *
 * Its own route rather than a dialog on the table, for two reasons: the field
 * must exist without JavaScript (a dialog's contents live in a portal that only
 * renders once opened), and a form with validation needs somewhere to render its
 * errors.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const users = adminUsers();
  const actor = await requireOwner(request, { users });
  const targetId = params.adminId ?? "";

  // Your own password goes through /internal/profile, which requires the current
  // one. Redirect rather than render a form that the service would refuse. This
  // compares ids, so it needs no lookup and still happens before anything renders.
  if (targetId === actor.id) throw redirect("/internal/profile");

  // The target is resolved so the page can name them. It streams: the owner
  // check above is the only thing the frame waits on. An unknown id resolves to
  // `null`, rendered as a not-found state rather than a form that fails on submit.
  return { targetId, target: streamRegion("admin_reset", "target", users.findById(targetId).then((found) => found ?? null)) };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const users = adminUsers();
  const actor = await requireOwner(request, { users });
  const form = await request.formData();

  const newPassword = String(form.get("newPassword") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");

  // Confirmation is a UI concern, checked here rather than in the service: the
  // service takes one password, and a mismatch is a typo, not a domain rule.
  if (newPassword !== confirmPassword) {
    return data({ error: "mismatch" as const }, { status: 400 });
  }

  const result = await resetAdminPassword({
    actorId: actor.id,
    targetId: params.adminId ?? "",
    newPassword,
  }, { users, runtime: appRuntime() });

  if (!result.ok) {
    const reason: AdminErrorReason = result.reason;
    return data({ error: reason }, { status: 400 });
  }

  // Back to the table, which shows the success message.
  return redirect("/internal/admins?reset=1");
};

export default function ResetAdminPassword() {
  const { targetId, target } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const busy = navigation.state !== "idle";
  const error = actionData?.error;

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-col gap-2 px-4 lg:px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/internal/admins">Admins</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbPage>Reset password</BreadcrumbPage>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="text-2xl font-semibold tracking-tight">Reset admin password</h1>
      </div>
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              {error === "mismatch" ? "The new passwords do not match." : ADMIN_ERRORS[error]}
            </AlertDescription>
          </Alert>
        )}

        <Deferred resolve={target} resetKey={targetId} fallback={<ResetSkeleton />} errorTitle="This admin">
          {(loaded) =>
            loaded ? (
              <ResetPasswordCard name={loaded.name} busy={busy} />
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserX />
                  </EmptyMedia>
                  <EmptyTitle>Admin not found</EmptyTitle>
                  <EmptyDescription>That account no longer exists.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          }
        </Deferred>
      </div>
    </div>
  );
}

function ResetSkeleton() {
  return (
    <Card aria-hidden>
      <CardHeader>
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}
