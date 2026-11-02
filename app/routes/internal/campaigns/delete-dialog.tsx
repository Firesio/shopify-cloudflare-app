import { useState } from "react";
import { Form } from "react-router";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/internal/components/ui/alert-dialog";
import { Button } from "~/internal/components/ui/button";
import { Spinner } from "~/internal/components/ui/spinner";

const DELETE_FORM_ID = "delete-campaign";

/** A draft nobody was written to can be thrown away; this is the only way to remove one. */
export function DeleteDraftDialog({ name, pending, busy }: { readonly name: string; readonly pending: boolean; readonly busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Form method="post" id={DELETE_FORM_ID} className="hidden" onSubmit={() => setOpen(false)}>
        <input type="hidden" name="intent" value="delete" />
      </Form>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={busy}>
            {pending ? <Spinner /> : <Trash2 />}
            Delete draft
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete “${name}”?`}</AlertDialogTitle>
            <AlertDialogDescription>The draft is removed for good. Nothing has been sent, so nobody is affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction type="submit" form={DELETE_FORM_ID} variant="destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
