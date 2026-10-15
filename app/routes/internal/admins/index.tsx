import { data, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Admins · Staff Console" },
];
import { useState } from "react";
import { requireOwner } from "~/services/admin-auth.server";
import { adminUsers } from "~/wiring.server";
// Type-only: erased at build, so it does not pull the server module into the
// client bundle.
import type { AdminErrorReason } from "~/services/admin-management.server";
import type { SafeAdminUser } from "~/db/schema";
import { INTENTS, SUCCESS_KEY, readIntent, type Intent } from "./intents.server";
import { AdminAlerts, useAdminFeedback, type AdminActionResult, type AdminFeedback } from "./feedback";
import { Deferred, TableSkeleton } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { AdminsTable } from "./table";
import { AddAdminDialog } from "./add-form";
import { RemoveAdminDialog } from "./remove-dialog";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Owner-only. requireOwner throws 403 for a signed-in non-owner, which the
  // layout's ErrorBoundary renders.
  const actor = await requireOwner(request, { users: adminUsers() });
  const url = new URL(request.url);
  return {
    actor,
    // Streamed: the owner check above is all the page frame waits on.
    admins: streamRegion("admins", "list", adminUsers().list()),
    // Set by reset.tsx's redirect after a password reset — that page has
    // nothing of its own to render success on, since it navigates away.
    resetSuccess: url.searchParams.get("reset") === "1",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const actor = await requireOwner(request, { users: adminUsers() });
  const form = await request.formData();
  const intent = readIntent(form);

  // Unknown intent: a bad request, not a crash.
  if (!intent) {
    const notFound: AdminErrorReason = "notFound";
    return data({ error: notFound }, { status: 400 });
  }

  const handler = INTENTS[intent];

  const result = await handler(form, actor.id);
  if (!result.ok) return data({ error: result.reason }, { status: 400 });

  return data({
    success: SUCCESS_KEY[intent],
    name: result.value?.name ?? "",
    role: result.value?.role ?? "",
  });
};

interface AddDialogState {
  readonly open: boolean;
  /** The action result that was current when the state was last reconciled. */
  readonly seen: AdminActionResult | undefined;
  /** Whether a result has arrived since the dialog opened. */
  readonly fresh: boolean;
}

/**
 * Drives the add dialog from the action result: a NEW result that succeeded
 * closes it; a new error keeps it open and is shown inside it (so the page-level
 * alert does not repeat it). Reconciled during render, the pattern React
 * documents for state that follows a prop, so no effect writes state.
 */
function useAddDialog(result: AdminActionResult | undefined, feedback: AdminFeedback) {
  const [state, setState] = useState<AddDialogState>({ open: false, seen: result, fresh: false });
  if (state.seen !== result) {
    setState({ open: state.open && result?.success !== "created", seen: result, fresh: state.open });
  }
  const error = state.open && state.fresh ? feedback.errorMessage : undefined;
  return {
    open: state.open,
    error,
    onOpenChange: (open: boolean) => setState({ open, seen: result, fresh: false }),
    // The error is shown in the dialog, so the page-level alert must not repeat it.
    pageFeedback: { errorMessage: error ? undefined : feedback.errorMessage, successMessage: feedback.successMessage },
  };
}

export default function Admins() {
  const { actor, admins, resetSuccess } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const busy = navigation.state !== "idle";
  // Which single control is the one actually submitting, so only ITS button
  // spins — not every button on the page.
  const pendingIntent = navigation.formData?.get("intent");
  const pendingId = navigation.formData?.get("id");
  const isPending = (intent: Intent, id?: string) =>
    busy && pendingIntent === intent && (id === undefined || pendingId === id);

  const feedback = useAdminFeedback(actionData, resetSuccess);

  // One dialog for the whole table rather than one per row: only ever a single
  // pending confirmation, so a single piece of state describes it.
  const [confirming, setConfirming] = useState<SafeAdminUser | null>(null);

  const addDialog = useAddDialog(actionData, feedback);

  const toolbarStart = <p className="text-sm text-muted-foreground">Who can sign in to this console</p>;
  const addAdmin = (
    <AddAdminDialog
      open={addDialog.open}
      onOpenChange={addDialog.onOpenChange}
      busy={busy}
      loading={isPending("create")}
      error={addDialog.error}
    />
  );

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-col gap-4 px-4 empty:hidden lg:px-6">
        <AdminAlerts feedback={addDialog.pageFeedback} resetSuccess={resetSuccess} />
      </div>
      <Deferred
        resolve={admins}
        fallback={
          // The same toolbar the table renders, so the action is there from the first paint.
          <div className="flex flex-col gap-4 px-4 lg:px-6">
            <div className="flex items-center justify-between gap-2">
              {toolbarStart}
              {addAdmin}
            </div>
            <TableSkeleton rows={4} columns={6} />
          </div>
        }
        errorTitle="The admins list"
      >
        {(resolved) => (
          <AdminsTable
            admins={resolved}
            actorId={actor.id}
            busy={busy}
            isPending={isPending}
            onRemove={setConfirming}
            toolbarStart={toolbarStart}
            toolbarEnd={addAdmin}
          />
        )}
      </Deferred>
      <RemoveAdminDialog confirming={confirming} busy={busy} onClose={() => setConfirming(null)} />
    </div>
  );
}
