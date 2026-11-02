import { useState } from "react";
import { Form } from "react-router";
import { Pause, Play, XCircle } from "lucide-react";
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
import type { CampaignStatus } from "~/domain/campaign";
import { shops } from "./outcomes";
import type { Intent } from "./intents.server";
import { usePending } from "./use-pending";

const CANCEL_FORM_ID = "cancel-campaign";

function IntentButton({ intent, icon, children, variant = "outline" }: { readonly intent: Intent; readonly icon: "pause" | "play"; readonly children: string; readonly variant?: "outline" | "default" }) {
  const pending = usePending();
  const Icon = icon === "pause" ? Pause : Play;
  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <Button type="submit" variant={variant} size="sm" disabled={pending.busy}>
        {pending.is(intent) ? <Spinner /> : <Icon />}
        {children}
      </Button>
    </Form>
  );
}

function CancelDialog({ recipientsWaiting }: { readonly recipientsWaiting: number }) {
  const [open, setOpen] = useState(false);
  const pending = usePending();
  return (
    <>
      <Form method="post" id={CANCEL_FORM_ID} className="hidden" onSubmit={() => setOpen(false)}>
        <input type="hidden" name="intent" value="cancel" />
      </Form>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={pending.busy}>
            {pending.is("cancel") ? <Spinner /> : <XCircle />}
            Cancel campaign
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              {`The ${shops(recipientsWaiting)} still waiting will not receive it, and it cannot be started again. Whoever already got it keeps it: a delivered mail cannot be taken back.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep sending</AlertDialogCancel>
            <AlertDialogAction type="submit" form={CANCEL_FORM_ID} variant="destructive">
              Cancel campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** What a person can do now, by state: pause while it goes out, resume when it is paused, cancel in either. */
export function ReportControls({ status, waiting }: { readonly status: CampaignStatus; readonly waiting: number }) {
  if (status === "sending") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <IntentButton intent="pause" icon="pause">Pause</IntentButton>
        <CancelDialog recipientsWaiting={waiting} />
      </div>
    );
  }
  if (status === "paused") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <IntentButton intent="resume" icon="play" variant="default">Resume</IntentButton>
        <CancelDialog recipientsWaiting={waiting} />
      </div>
    );
  }
  return null;
}
