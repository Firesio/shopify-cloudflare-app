import { useState } from "react";
import { Form, useNavigation } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/internal/components/ui/alert-dialog";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/internal/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/internal/components/ui/select";
import { Spinner } from "~/internal/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/internal/components/ui/table";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { LanguageCode } from "~/i18n/catalogues.generated";

/** The internal console is staff-only and English-only — no i18n here. */
const LANGUAGE: LanguageCode = "en";

/** id of the hidden revoke form that the confirmation dialog submits. */
const REVOKE_FORM_ID = "revoke-promo";

const DURATIONS = [3, 7, 10, 14, 30, 90] as const;

interface PromoGrant {
  readonly id: string;
  readonly planHandle: string;
  readonly reason: string;
  readonly grantedBy: string;
  readonly startsAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
}

interface PromoPlan {
  readonly handle: string;
  readonly name: string;
}

interface EffectivePlan {
  readonly planHandle: string;
  readonly source: string;
  readonly activePromo: {
    readonly planHandle: string;
    readonly remainingDays: number;
  } | null;
}

function EffectiveBadge({ effective }: { effective: EffectivePlan }) {
  if (effective.source === "promo") {
    return (
      <Badge variant="secondary">
        {`Promo Active: ${effective.planHandle.toUpperCase()} (${effective.activePromo?.remainingDays}d left)`}
      </Badge>
    );
  }
  if (effective.activePromo) {
    return (
      <Badge variant="outline">
        {`Paid Plan Active: ${effective.planHandle.toUpperCase()} (Promo ${effective.activePromo.planHandle.toUpperCase()} superseded)`}
      </Badge>
    );
  }
  return <Badge variant="outline">No Active Promo</Badge>;
}

/** True while the submission with this intent is the one in flight, so only ITS button spins. */
function usePendingIntent(intent: string): boolean {
  const navigation = useNavigation();
  return navigation.state !== "idle" && navigation.formData?.get("intent") === intent;
}

function PromoFields({ plans }: { plans: readonly PromoPlan[] }) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="planHandle">Promo plan</FieldLabel>
        <Select name="planHandle" defaultValue={plans[0]?.handle} required>
          <SelectTrigger id="planHandle" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {plans.map((p) => (
              <SelectItem key={p.handle} value={p.handle}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="durationDays">Duration</FieldLabel>
        <Select name="durationDays" defaultValue="10">
          <SelectTrigger id="durationDays" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATIONS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {`${days} days`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="reason">Reason / justification</FieldLabel>
        <Input
          id="reason"
          name="reason"
          placeholder="e.g., VIP Demo, Retention goodwill, Extended trial"
          required
        />
      </Field>
    </FieldGroup>
  );
}

function GrantPromoDialog({ plans }: { plans: readonly PromoPlan[] }) {
  const [open, setOpen] = useState(false);
  const pending = usePendingIntent("grant_promo");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={plans.length === 0}>
          Grant promo
        </Button>
      </DialogTrigger>
      <DialogContent>
        {/* Submitting closes the dialog; the browser's own validation has already
            run by the time onSubmit fires, so an invalid form never closes it. */}
        <Form method="post" className="grid gap-4" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="grant_promo" />
          <DialogHeader>
            <DialogTitle>Grant a promotional plan</DialogTitle>
            <DialogDescription>
              Temporary comped access that expires on its own. A paid higher-tier plan still takes precedence.
            </DialogDescription>
          </DialogHeader>
          <PromoFields plans={plans} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Grant promo
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function GrantStatusBadge({ isActive, isRevoked }: { isActive: boolean; isRevoked: boolean }) {
  if (isActive) return <Badge variant="secondary">Active</Badge>;
  if (isRevoked) return <Badge variant="destructive">Revoked</Badge>;
  return <Badge variant="outline">Expired</Badge>;
}

function GrantRow({ grant, now, onRevoke }: { grant: PromoGrant; now: number; onRevoke: (grant: PromoGrant) => void }) {
  const isExpired = now >= grant.expiresAt;
  const isRevoked = grant.revokedAt !== null;
  const isActive = !isExpired && !isRevoked && now >= grant.startsAt;

  return (
    <TableRow>
      <TableCell className="pl-4 font-medium">{grant.planHandle.toUpperCase()}</TableCell>
      <TableCell>
        <GrantStatusBadge isActive={isActive} isRevoked={isRevoked} />
      </TableCell>
      <TableCell className="max-w-xs truncate text-muted-foreground">{grant.reason}</TableCell>
      <TableCell className="text-muted-foreground">{grant.grantedBy}</TableCell>
      <TableCell className="text-muted-foreground tabular-nums">{formatDateTime(LANGUAGE, grant.expiresAt, UTC)}</TableCell>
      <TableCell className="pr-4 text-right">
        {isActive && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-destructive hover:text-destructive"
            onClick={() => onRevoke(grant)}
          >
            Revoke
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function GrantHistoryTable({
  grants,
  now,
  onRevoke,
}: {
  grants: readonly PromoGrant[];
  now: number;
  onRevoke: (grant: PromoGrant) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Plan</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Granted by</TableHead>
          <TableHead>Valid until</TableHead>
          <TableHead className="pr-4 text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {grants.map((grant) => (
          <GrantRow key={grant.id} grant={grant} now={now} onRevoke={onRevoke} />
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The confirm button submits the hidden form by id, so revoking stays a normal
 * POST to the action: same intent, same field names, same server guards.
 */
function RevokeGrantDialog({ revoking, onClose }: { revoking: PromoGrant | null; onClose: () => void }) {
  const pending = usePendingIntent("revoke_promo");
  return (
    <>
      <Form method="post" id={REVOKE_FORM_ID} className="hidden" onSubmit={onClose}>
        <input type="hidden" name="intent" value="revoke_promo" />
        <input type="hidden" name="grantId" value={revoking?.id ?? ""} />
      </Form>
      <AlertDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Revoke the ${revoking?.planHandle.toUpperCase() ?? ""} promo?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The shop loses the comped plan immediately. This cannot be undone; grant a new promo to restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit" form={REVOKE_FORM_ID} variant="destructive" disabled={pending}>
              {pending && <Spinner />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function PromoOverridesCard({
  effective,
  canGrant,
  plans,
  grants,
  now,
}: {
  effective: EffectivePlan;
  canGrant: boolean;
  plans: readonly PromoPlan[];
  grants: readonly PromoGrant[];
  now: number;
}) {
  // One dialog for the whole table: only ever a single pending confirmation.
  const [revoking, setRevoking] = useState<PromoGrant | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Promotional Plan Overrides</CardTitle>
        <CardDescription>
          Grant temporary comped plan access with auto-expiry. Organic higher-tier plans take precedence.
        </CardDescription>
        <CardAction className="flex flex-wrap items-center justify-end gap-2">
          <EffectiveBadge effective={effective} />
          {canGrant && <GrantPromoDialog plans={plans} />}
        </CardAction>
      </CardHeader>
      {grants.length > 0 && (
        <CardContent className="px-0">
          <GrantHistoryTable grants={grants} now={now} onRevoke={setRevoking} />
        </CardContent>
      )}
      <RevokeGrantDialog revoking={revoking} onClose={() => setRevoking(null)} />
    </Card>
  );
}
