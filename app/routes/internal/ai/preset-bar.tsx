import { Form, useNavigation } from "react-router";
import { RotateCcw, Wand2 } from "lucide-react";
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
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Spinner } from "~/internal/components/ui/spinner";
import type { PresetScope } from "~/ai/preset";

const RESET_FORM_ID = "reset-all-purposes";

/** True while the preset of this scope is in flight, so only the pressed control spins. */
function useIsPresetPending(scope: PresetScope): boolean {
  const { state, formData } = useNavigation();
  return state !== "idle" && formData?.get("intent") === "preset" && formData.get("scope") === scope;
}

function PresetFields({ scope }: { scope: PresetScope }) {
  return (
    <>
      <input type="hidden" name="intent" value="preset" />
      <input type="hidden" name="scope" value={scope} />
    </>
  );
}

function SetUpRecommended({ busy }: { busy: boolean }) {
  const pending = useIsPresetPending("empty");
  return (
    <Form method="post">
      <PresetFields scope="empty" />
      <Button type="submit" disabled={busy}>
        {pending ? <Spinner /> : <Wand2 />}
        Set up recommended
      </Button>
    </Form>
  );
}

/** Overwrites chains staff may have tuned, so it asks first. */
function ResetAll({ busy }: { busy: boolean }) {
  const pending = useIsPresetPending("all");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={busy}>
          {pending ? <Spinner /> : <RotateCcw />}
          Reset all to recommended
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset every purpose?</AlertDialogTitle>
          <AlertDialogDescription>
            Every purpose goes back to its recommended models. Any order or model you chose by hand is replaced.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form id={RESET_FORM_ID} method="post">
          <PresetFields scope="all" />
        </Form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction type="submit" form={RESET_FORM_ID} disabled={busy}>
            Reset all
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The whole setup in one click. Purposes with no models are OFF, so the bar says how many, and offers the safe
 * action (fill only those) first; resetting everything is secondary and confirmed.
 */
export function PresetBar({ unconfigured, total, busy }: { unconfigured: number; total: number; busy: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommended setup</CardTitle>
        <CardDescription>
          {unconfigured === 0
            ? "Every purpose has models."
            : `${unconfigured} of ${total} purposes have no models, so the features that use them are off.`}
        </CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2">
          {unconfigured > 0 && <SetUpRecommended busy={busy} />}
          <ResetAll busy={busy} />
        </CardAction>
      </CardHeader>
    </Card>
  );
}
