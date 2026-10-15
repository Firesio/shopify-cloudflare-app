import { Form, useNavigation } from "react-router";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/internal/components/ui/alert";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Spinner } from "~/internal/components/ui/spinner";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Locale } from "~/i18n/config";

/** The internal console is staff-only and English-only — no i18n here. */
const LOCALE: Locale = "en";

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

function StoreTypeControl({ isDevStore }: { isDevStore: boolean }) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const toggling = busy && navigation.formData?.get("intent") === "toggle_dev_status";
  return (
    <div className="flex items-center gap-2">
      <Badge variant={isDevStore ? "secondary" : "outline"}>
        {isDevStore ? "Development Store" : "Production Store"}
      </Badge>
      <Form method="post">
        <input type="hidden" name="intent" value="toggle_dev_status" />
        <Button type="submit" variant="ghost" size="xs" disabled={busy}>
          {toggling && <Spinner />}
          {isDevStore ? "Mark Production" : "Mark Dev"}
        </Button>
      </Form>
    </div>
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
            <StoreTypeControl isDevStore={shop.isDevStore} />
          </Fact>
          <Fact label="Installed">{formatDateTime(LOCALE, shop.installedAt, UTC)}</Fact>
          <Fact label="Uninstalled">
            {shop.uninstalledAt === null ? "—" : formatDateTime(LOCALE, shop.uninstalledAt, UTC)}
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}
