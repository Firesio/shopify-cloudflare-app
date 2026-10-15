import { useState } from "react";
import { useNavigation, useSubmit } from "react-router";
import { EllipsisVertical, Trash2 } from "lucide-react";
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
import { Button } from "~/internal/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/internal/components/ui/dropdown-menu";
import { Spinner } from "~/internal/components/ui/spinner";

/**
 * Row actions for a token or OAuth client. Revoking cannot be undone, so it is
 * confirmed in an AlertDialog; confirming posts the same `intent` + id fields
 * the route's action has always read.
 */
export function RevokeAction({
  intent,
  idField,
  id,
  name,
  noun,
}: {
  intent: "revoke_token" | "revoke_client";
  idField: "token_id" | "client_id";
  id: string;
  /** What the row is called, for the confirmation text. */
  name: string;
  noun: "token" | "client";
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submit = useSubmit();
  const { state, formData } = useNavigation();
  const pending =
    state !== "idle" && formData?.get("intent") === intent && formData.get(idField) === id;

  function revoke() {
    const form = new FormData();
    form.set("intent", intent);
    form.set(idField, id);
    void submit(form, { method: "post" });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
            aria-label={`Actions for ${name}`}
            disabled={pending}
          >
            {pending ? <Spinner /> : <EllipsisVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 />
            Revoke
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {noun} “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using this {noun} stops working immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={revoke}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
