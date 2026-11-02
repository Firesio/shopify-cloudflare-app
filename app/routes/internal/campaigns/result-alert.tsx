import { Alert, AlertDescription } from "~/internal/components/ui/alert";
import type { CampaignActionResult } from "./outcomes";

/**
 * The last refusal, written out on the page. The toast is the transient layer on top; this stays until the next
 * submission, so a message such as "the audience changed, nothing was sent" is not lost when a toast fades.
 */
export function ResultAlert({ result }: { readonly result: CampaignActionResult | undefined }) {
  if (result?.kind !== "failed") return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{result.message}</AlertDescription>
    </Alert>
  );
}
