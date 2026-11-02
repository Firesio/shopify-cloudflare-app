import { useState } from "react";
import { Form } from "react-router";
import { Send } from "lucide-react";
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
import { shops } from "./outcomes";

const SEND_FORM_ID = "send-campaign";

/**
 * "Send to N shops": the one step that cannot be taken back, so it asks once more and says the number. The number is
 * sent with the request: the server refuses, and shows the new count, if the audience is no longer that size.
 */
export function SendDialog({ recipients, disabled, sending }: { readonly recipients: number; readonly disabled: boolean; readonly sending: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Form method="post" id={SEND_FORM_ID} className="hidden" onSubmit={() => setOpen(false)}>
        <input type="hidden" name="intent" value="start" />
        <input type="hidden" name="expectedRecipients" value={recipients} />
      </Form>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" disabled={disabled}>
            {sending ? <Spinner /> : <Send />}
            {`Send to ${shops(recipients)}`}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Send to ${shops(recipients)}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`This emails ${shops(recipients)} now. It cannot be undone, and a mail that has been delivered cannot be taken back. You can still pause or cancel while it goes out.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction type="submit" form={SEND_FORM_ID}>
              {`Send to ${shops(recipients)}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
