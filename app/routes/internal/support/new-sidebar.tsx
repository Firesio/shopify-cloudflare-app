import type { ReactNode } from "react";
import { Badge } from "~/internal/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Info } from "lucide-react";
import type { ShopContactInfo } from "./new-form-state";

function PreviewRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

function RecipientValue({ email }: { readonly email: string | null }) {
  if (!email) return <span className="text-xs text-destructive">No email found</span>;
  return (
    <span className="font-mono text-xs font-medium truncate max-w-40">
      {email}
    </span>
  );
}

interface OutreachPreviewProps {
  readonly effectiveShop: string;
  readonly contact: ShopContactInfo;
  readonly actorName: string;
}

export function OutreachPreview({ effectiveShop, contact, actorName }: OutreachPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Outreach preview</CardTitle>
        <CardDescription>Summary of how this ticket will be delivered.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <PreviewRow label="Destination:">
          <span className="font-mono text-xs truncate max-w-40">{effectiveShop || "—"}</span>
        </PreviewRow>
        <PreviewRow label="Merchant:">
          <span className="font-medium text-xs truncate max-w-40">{contact.shopName}</span>
        </PreviewRow>
        <PreviewRow label="Recipient:">
          <RecipientValue email={contact.merchantEmail} />
        </PreviewRow>
        <PreviewRow label="Author:">
          <span className="text-xs font-medium">{actorName}</span>
        </PreviewRow>
        <PreviewRow label="Initial Status:">
          <Badge variant="secondary">Waiting on merchant</Badge>
        </PreviewRow>
      </CardContent>
    </Card>
  );
}

export function OutreachNotes() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <CardTitle className="text-sm">Proactive outreach</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="flex list-disc flex-col gap-2 ps-4 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong className="font-medium text-foreground">Email dispatch:</strong> When created, an email with your message and direct thread link is sent to the merchant.
          </li>
          <li>
            <strong className="font-medium text-foreground">Replies:</strong> When the merchant replies by email or in the app, their response reopens the ticket and notifies staff.
          </li>
          <li>
            <strong className="font-medium text-foreground">AI polish:</strong> You can quickly type bullet notes and click &ldquo;Polish &amp; optimize&rdquo; to draft a professional message.
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
