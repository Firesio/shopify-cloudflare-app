import type { ReactNode } from "react";
import { Badge } from "~/internal/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import type { ThreadMessage } from "~/components/support/Thread";
import { Conversation } from "./conversation";
import { formatDateTime, formatNumber } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Locale } from "~/i18n/config";
import type { SupportStatus } from "~/support/status";
import { STATUS_LABEL, STATUS_VARIANT } from "./status-display";

/** The internal console is staff-only and English-only — no i18n here. */
const LOCALE: Locale = "en";

function Detail({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

export function ConversationCard({
  messages,
  merchantLabel,
}: {
  readonly messages: readonly ThreadMessage[];
  readonly merchantLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation</CardTitle>
        <CardDescription>{`${formatNumber(LOCALE, messages.length)} ${messages.length === 1 ? "message" : "messages"}`}</CardDescription>
      </CardHeader>
      <CardContent>
        <Conversation
          messages={messages}
          merchantLabel={merchantLabel}
          formatFileSize={(sizeBytes) => `${formatNumber(LOCALE, Math.max(1, Math.round(sizeBytes / 1024)))} KB`}
          formatWhen={(at) => formatDateTime(LOCALE, at, UTC)}
        />
      </CardContent>
    </Card>
  );
}

export interface DetailsCardProps {
  readonly status: SupportStatus;
  readonly shop: string;
  readonly plan: { readonly name: string; readonly status: string } | null;
  readonly createdAt: number;
  readonly merchantEmail: string | null;
  readonly ccEmails: readonly string[];
}

export function DetailsCard({ status, shop, plan, createdAt, merchantEmail, ccEmails }: DetailsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-4">
          <Detail label="Status">
            <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
          </Detail>
          <Detail label="Shop">{shop}</Detail>
          <Detail label="Plan">{plan ? `${plan.name} · ${plan.status}` : "Free"}</Detail>
          {plan && <Detail label="Subscription">{plan.status}</Detail>}
          <Detail label="Opened">{formatDateTime(LOCALE, createdAt, UTC)}</Detail>
          <Detail label="Reply to">{merchantEmail ?? "In-app only"}</Detail>
          <Detail label="Copied">{ccEmails.length > 0 ? ccEmails.join(", ") : "—"}</Detail>
        </dl>
      </CardContent>
    </Card>
  );
}
