import { Form } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/internal/components/ui/alert-dialog";
import { Spinner } from "~/internal/components/ui/spinner";
import type { SafeAdminUser } from "~/db/schema";

/** id of the hidden removal form that the dialog's confirm button submits. */
const REMOVE_FORM_ID = "remove-admin";

/**
 * The confirm button submits THIS form by id, so removal stays a normal
 * POST to the action — no fetch, no client-side mutation path, and
 * the same server guards apply. Closing on submit is a plain event
 * handler rather than an effect watching the navigation state.
 */
export function RemoveAdminDialog({
  confirming,
  busy,
  onClose,
}: {
  confirming: SafeAdminUser | null;
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <Form method="post" id={REMOVE_FORM_ID} className="hidden" onSubmit={onClose}>
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="id" value={confirming?.id ?? ""} />
      </Form>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove ${confirming?.name ?? ""}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose access to the console immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit" form={REMOVE_FORM_ID} variant="destructive" disabled={busy}>
              {busy && <Spinner />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
