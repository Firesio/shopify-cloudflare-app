import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/internal/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Progress } from "~/internal/components/ui/progress";
import { percentDone, type PauseReason, type RecipientCounts } from "~/domain/campaign-delivery";
import { formatNumber } from "~/i18n/format";
import { PAUSE_EXPLANATION, RECIPIENT_LABEL, RECIPIENT_MEANING, RECIPIENT_STATUSES, totalOf } from "./display";

/** Why a campaign is paused, in plain words, and what to do. A pause by a person needs no explaining. */
export function PauseNotice({ reason }: { readonly reason: PauseReason | null }) {
  if (reason === null) return null;
  const explanation = PAUSE_EXPLANATION[reason];
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>{explanation.title}</AlertTitle>
      <AlertDescription>{explanation.advice}</AlertDescription>
    </Alert>
  );
}

/** How far along, as a bar and as five counts that add up to everyone. */
export function ProgressCard({ counts }: { readonly counts: RecipientCounts }) {
  const percent = percentDone(counts);
  const total = totalOf(counts);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress</CardTitle>
        <CardDescription>{`${formatNumber("en", total - counts.pending)} of ${formatNumber("en", total)} handled`}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Progress value={percent} aria-label="Share of recipients handled" aria-valuenow={percent} className="h-3" />
          <span className="w-12 text-right text-sm font-medium tabular-nums">{`${percent}%`}</span>
        </div>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {RECIPIENT_STATUSES.map((status) => (
            <div key={status} className="flex flex-col gap-0.5 rounded-lg border p-3">
              <dt className="text-sm text-muted-foreground">{RECIPIENT_LABEL[status]}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{formatNumber("en", counts[status])}</dd>
              <dd className="text-xs text-muted-foreground">{RECIPIENT_MEANING[status]}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
