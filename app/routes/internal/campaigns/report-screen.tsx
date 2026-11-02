import { Link } from "react-router";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "~/internal/components/ui/breadcrumb";
import { Badge } from "~/internal/components/ui/badge";
import type { RecipientCounts } from "~/domain/campaign-delivery";
import type { Campaign, CampaignRecipient, RecipientStatus } from "~/ports/campaigns";
import { paths } from "~/urls";
import { STATUS_HINT, STATUS_LABEL, STATUS_VARIANT } from "./display";
import { LiveStatus } from "./live-status";
import { PauseNotice, ProgressCard } from "./report-progress";
import { AudienceCard, SentWordsCard } from "./report-details";
import { ReportControls } from "./report-controls";
import { RecipientsTable } from "./report-recipients";
import { ResultAlert } from "./result-alert";
import { useCampaignResult } from "./use-pending";

interface ReportScreenProps {
  readonly campaign: Campaign;
  readonly counts: RecipientCounts;
  readonly recipients: readonly CampaignRecipient[];
  readonly recipientStatus: RecipientStatus | null;
  readonly recipientLimit: number;
}

/** A campaign that has started: how far it got, what it said, who it went to, and the controls that apply now. */
export function ReportScreen({ campaign, counts, recipients, recipientStatus, recipientLimit }: ReportScreenProps) {
  const result = useCampaignResult();

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
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
              <BreadcrumbPage>{campaign.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
              <Badge variant={STATUS_VARIANT[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{STATUS_HINT[campaign.status]}</p>
          </div>
          <ReportControls status={campaign.status} waiting={counts.pending} />
        </div>
        {campaign.status === "sending" && <LiveStatus />}
      </div>

      <div className="flex flex-col gap-4 px-4 md:gap-6 lg:px-6">
        <ResultAlert result={result} />
        {campaign.status === "paused" && <PauseNotice reason={campaign.pauseReason} />}
        <ProgressCard counts={counts} />
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          <SentWordsCard campaign={campaign} />
          <AudienceCard campaign={campaign} />
        </div>
      </div>

      <RecipientsTable recipients={recipients} counts={counts} status={recipientStatus} limit={recipientLimit} />
    </div>
  );
}
