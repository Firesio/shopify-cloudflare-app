import { useState } from "react";
import { Form, Link } from "react-router";
import { Save } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "~/internal/components/ui/breadcrumb";
import { Button } from "~/internal/components/ui/button";
import { Spinner } from "~/internal/components/ui/spinner";
import { DEFAULT_AUDIENCE, type AudiencePreview } from "~/domain/campaign-audience";
import type { Campaign } from "~/ports/campaigns";
import { paths } from "~/urls";
import { AudienceStep } from "./audience-step";
import { DeleteDraftDialog } from "./delete-dialog";
import { ResultAlert } from "./result-alert";
import { ReviewStep } from "./review-step";
import { WriteStep } from "./write-step";
import { useCampaignResult, usePending } from "./use-pending";

interface DraftScreenProps {
  /** The saved draft, or undefined on the "new" page. */
  readonly campaign: Campaign | undefined;
  /** Who a send of the SAVED draft (or, before the first save, of the default audience) would reach. */
  readonly preview: AudiencePreview;
  readonly actorEmail: string;
}

/**
 * A campaign that has not been sent, as three steps on one page: write it, choose who gets it, review and send. Steps 1
 * and 2 are one form that saves the draft; step 3 reads the saved draft back, so it is outside that form.
 */
export function DraftScreen({ campaign, preview, actorEmail }: DraftScreenProps) {
  const result = useCampaignResult();
  const pending = usePending();
  // "Unsaved" is relative to the saved version: a save changes `updatedAt`, which makes the old mark stale by itself.
  const version = campaign?.updatedAt ?? 0;
  const [editedAt, setEditedAt] = useState<number | null>(null);
  const unsaved = editedAt === version;

  const errors = result?.kind === "failed" ? result.fields : {};
  const title = campaign === undefined ? "New campaign" : campaign.name;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-col gap-3 px-4 lg:px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={paths.internal.campaigns()}>Campaigns</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{campaign === undefined ? "Write it, choose who gets it, then review and send." : "Draft. Nothing is sent until you press Send in step 3."}</p>
          </div>
          {campaign !== undefined && <DeleteDraftDialog name={campaign.name} pending={pending.is("delete")} busy={pending.busy} />}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 md:gap-6 lg:px-6">
        <ResultAlert result={result} />
        <Form method="post" className="flex flex-col gap-4 md:gap-6" onChange={() => setEditedAt(version)}>
          <input type="hidden" name="intent" value="save" />
          <WriteStep
            content={{ name: campaign?.name ?? "", subject: campaign?.subject ?? "", body: campaign?.body ?? "", ctaLabel: campaign?.ctaLabel ?? "", ctaUrl: campaign?.ctaUrl ?? "" }}
            errors={errors}
          />
          <AudienceStep audience={campaign?.audience ?? DEFAULT_AUDIENCE} savedPreview={preview} saved={campaign !== undefined} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending.busy}>
              {pending.is("save") ? <Spinner /> : <Save />}
              {campaign === undefined ? "Save draft" : "Save changes"}
            </Button>
            <p className="text-sm text-muted-foreground">Saving does not send anything.</p>
          </div>
        </Form>
        <ReviewStep campaign={campaign} preview={preview} actorEmail={actorEmail} unsaved={unsaved} />
      </div>
    </div>
  );
}
