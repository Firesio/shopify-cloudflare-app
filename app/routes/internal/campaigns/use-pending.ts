import { useActionData, useNavigation } from "react-router";
import { useActionToast } from "~/internal/use-action-toast";
import type { CampaignActionResult } from "./outcomes";
import type { Intent } from "./intents.server";

/** Which intent, if any, the page is submitting right now, so only the control that was pressed shows a spinner. */
export function usePending(): { readonly busy: boolean; readonly is: (intent: Intent) => boolean } {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const submitting = navigation.formData?.get("intent");
  return { busy, is: (intent) => busy && submitting === intent };
}

/** The last answer from the page's action. */
export function useCampaignResult(): CampaignActionResult | undefined {
  return useActionData<CampaignActionResult>();
}

/**
 * Pops a toast for each answer of the page's action. Called ONCE, by the route component that stays mounted: the page
 * swaps from the editor to the report when a send starts, and a toast hook inside each screen would fire again for the
 * same answer when the next screen mounted.
 */
export function useResultToast(): void {
  const result = useCampaignResult();
  useActionToast(result, result?.kind === "failed" ? { error: result.message } : { success: result?.kind === "done" ? result.message : undefined });
}
