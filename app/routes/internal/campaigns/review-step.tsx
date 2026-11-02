import { Form } from "react-router";
import { Mail } from "lucide-react";
import { Alert, AlertDescription } from "~/internal/components/ui/alert";
import { Button } from "~/internal/components/ui/button";
import { Card, CardContent } from "~/internal/components/ui/card";
import { Spinner } from "~/internal/components/ui/spinner";
import { describeAudience } from "~/domain/campaign-audience";
import type { AudiencePreview } from "~/domain/campaign-audience";
import type { Campaign } from "~/ports/campaigns";
import { shops } from "./outcomes";
import { PreviewCard } from "./audience-preview";
import { SendDialog } from "./send-dialog";
import { StepHeader } from "./step";
import { usePending } from "./use-pending";

interface ReviewStepProps {
  /** The saved draft: what a send would use. Undefined until the first save. */
  readonly campaign: Campaign | undefined;
  readonly preview: AudiencePreview;
  readonly actorEmail: string;
  /** The form above has changes that are not saved: the review is of the saved draft, so sending waits for the save. */
  readonly unsaved: boolean;
}

/** Step 3: read it back as the merchant will, try it on yourself, then send. Reads the SAVED draft, because that is what is sent. */
export function ReviewStep({ campaign, preview, actorEmail, unsaved }: ReviewStepProps) {
  const pending = usePending();
  return (
    <Card>
      <StepHeader number={3} title="Review and send" description="Check it, send yourself a test, then send it to everyone." />
      <CardContent className="flex flex-col gap-5">
        {campaign === undefined ? (
          <p className="text-sm text-muted-foreground">Save the draft first. Then you can try it on yourself and send it from here.</p>
        ) : (
          <>
            {unsaved && (
              <Alert>
                <AlertDescription>You have changes that are not saved. Save the draft first: this review, the test and the send all use the saved version.</AlertDescription>
              </Alert>
            )}
            <dl className="grid gap-4 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground">Subject</dt>
              <dd className="font-medium">{campaign.subject}</dd>
              <dt className="text-muted-foreground">Goes to</dt>
              <dd>
                <ul className="flex flex-col gap-1">
                  {describeAudience(campaign.audience).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </dd>
            </dl>
            <PreviewCard label="Who would receive it: the saved draft" preview={preview} caption="Counted just now for the saved audience. The number is checked again when you send." />
            <div className="flex flex-wrap items-center gap-3">
              <Form method="post">
                <input type="hidden" name="intent" value="test" />
                <Button type="submit" variant="outline" disabled={pending.busy || unsaved}>
                  {pending.is("test") ? <Spinner /> : <Mail />}
                  Send me a test
                </Button>
              </Form>
              <SendDialog recipients={preview.recipients} disabled={pending.busy || unsaved || preview.recipients === 0} sending={pending.is("start")} />
            </div>
            <p className="text-sm text-muted-foreground">
              {preview.recipients === 0
                ? "Nobody would receive this. Choose a wider audience in step 2 and save."
                : `The test goes to ${actorEmail} only. Sending reaches ${shops(preview.recipients)}.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
