import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { paragraphsOf } from "~/domain/campaign";
import { describeAudience } from "~/domain/campaign-audience";
import { formatDateTime, formatNumber } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Campaign } from "~/ports/campaigns";

const when = (instant: number | null) => (instant === null ? "—" : formatDateTime("en", instant, UTC));

/** The words that went out, read-only: what was written is what was sent. */
export function SentWordsCard({ campaign }: { readonly campaign: Campaign }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What was sent</CardTitle>
        <CardDescription>The words as merchants read them. They cannot be changed any more.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="font-medium">{campaign.subject}</p>
        {paragraphsOf(campaign.body).map((paragraph) => (
          <p key={paragraph} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
        {campaign.ctaLabel !== null && campaign.ctaUrl !== null && (
          <p className="text-muted-foreground">
            {`Button “${campaign.ctaLabel}” opens `}
            <span className="break-all">{campaign.ctaUrl}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Who it was for, and when each thing happened. */
export function AudienceCard({ campaign }: { readonly campaign: Campaign }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Who it goes to</CardTitle>
        <CardDescription>
          {campaign.recipientCount === null ? "Not chosen yet" : `${formatNumber("en", campaign.recipientCount)} shops, fixed when sending started`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 text-sm">
        <ul className="flex flex-col gap-1">
          {describeAudience(campaign.audience).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">Created by</dt>
          <dd>{campaign.createdByEmail}</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{when(campaign.createdAt)}</dd>
          <dt className="text-muted-foreground">Started</dt>
          <dd>{when(campaign.startedAt)}</dd>
          <dt className="text-muted-foreground">Finished</dt>
          <dd>{when(campaign.completedAt)}</dd>
          <dt className="text-muted-foreground">Last activity</dt>
          <dd>{when(campaign.lastPumpAt)}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
