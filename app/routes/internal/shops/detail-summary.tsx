import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/internal/components/ui/alert";
import { Badge } from "~/internal/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { LanguageCode } from "~/i18n/catalogues.generated";

/** The internal console is staff-only and English-only — no i18n here. */
const LANGUAGE: LanguageCode = "en";

interface SummaryShop {
  readonly contactEmail: string | null;
  readonly email: string | null;
  readonly uninstalledAt: number | null;
  readonly installedAt: number;
  readonly isDevStore: boolean;
}

export function ReconciliationFailureCard({
  failureDetail,
  failureCode,
}: {
  failureDetail: string | null;
  failureCode: string | null;
}) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Partner reconciliation failed</AlertTitle>
      <AlertDescription>{failureDetail ?? failureCode ?? "Unknown Partner API failure"}</AlertDescription>
    </Alert>
  );
}

/** A label above its value, for the summary's `<dl>`. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function ShopSummaryCard({ shop }: { shop: SummaryShop }) {
  const contact = shop.contactEmail || shop.email;
  const active = shop.uninstalledAt === null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
        <CardAction>
          <Badge variant={active ? "outline" : "secondary"}>{active ? "Active" : "Uninstalled"}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Contact">{contact ? <span className="truncate">{contact}</span> : "—"}</Fact>
          <Fact label="Store Type (Revenue Tracking)">
            <Badge variant={shop.isDevStore ? "secondary" : "outline"}>
              {shop.isDevStore ? "Development Store" : "Production Store"}
            </Badge>
          </Fact>
          <Fact label="Installed">{formatDateTime(LANGUAGE, shop.installedAt, UTC)}</Fact>
          <Fact label="Uninstalled">
            {shop.uninstalledAt === null ? "—" : formatDateTime(LANGUAGE, shop.uninstalledAt, UTC)}
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}
