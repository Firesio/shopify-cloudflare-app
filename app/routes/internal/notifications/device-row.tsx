import { useFetcher } from "react-router";
import { Laptop, Send, Smartphone, Tablet, Trash2, type LucideIcon } from "lucide-react";
import type { DeviceView, NotificationActionResult } from "~/domain/staff-notification-view";
import type { DeviceKind } from "~/ports/push-subscriptions";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/internal/components/ui/alert-dialog";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "~/internal/components/ui/item";
import { Spinner } from "~/internal/components/ui/spinner";
import { Switch } from "~/internal/components/ui/switch";
import { useActionToast } from "~/internal/use-action-toast";
import { describeResult } from "./messages";

const NOTIFICATIONS_ACTION = "/internal/notifications";

const KIND_ICON: Record<DeviceKind, LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Laptop,
};

const KIND_NAME: Record<DeviceKind, string> = { phone: "Phone", tablet: "Tablet", desktop: "Computer" };

function describeUse(device: DeviceView): string {
  const added = `Added ${formatDateTime("en", device.createdAt, UTC)}`;
  const used = device.lastUsedAt === null ? "Never used" : `Last used ${formatDateTime("en", device.lastUsedAt, UTC)}`;
  return `${added} · ${used}`;
}

/** Removal is confirmed first; the trigger is the trash button, so nothing is submitted until Remove is pressed. */
function RemoveDeviceDialog({
  device,
  isThisDevice,
  removing,
  onConfirm,
}: {
  readonly device: DeviceView;
  readonly isThisDevice: boolean;
  readonly removing: boolean;
  readonly onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${device.label}`} title="Remove device" disabled={removing}>
          {removing ? <Spinner /> : <Trash2 />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Remove ${device.label}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {isThisDevice
              ? "This browser will stop receiving push notifications until you enable it again."
              : "That device will stop receiving push notifications. It can be added again from that device."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface DeviceRowProps {
  readonly device: DeviceView;
  readonly isThisDevice: boolean;
  readonly pushConfigured: boolean;
  /** Removing THIS browser must also drop its browser-side subscription, which only the push hook can do. */
  readonly onRemoveThisDevice: () => void;
  readonly removingThisDevice: boolean;
}

/** One registered device: on/off, a test, and removal behind a confirmation. Each row has its own fetcher, so one device's pending state never shows on another. */
export function DeviceRow({ device, isThisDevice, pushConfigured, onRemoveThisDevice, removingThisDevice }: DeviceRowProps) {
  const fetcher = useFetcher<NotificationActionResult>({ key: `device:${device.id}` });
  useActionToast(fetcher.data, describeResult(fetcher.data));

  const Icon = KIND_ICON[device.kind];
  const intent = fetcher.formData?.get("intent");
  const enabled = intent === "device-enabled" ? fetcher.formData?.get("enabled") === "true" : device.enabled;
  const testing = intent === "test";
  const removing = intent === "device-remove" || removingThisDevice;

  const submit = (fields: Record<string, string>) => {
    void fetcher.submit({ ...fields, id: device.id }, { method: "post", action: NOTIFICATIONS_ACTION });
  };

  return (
    <Item variant="outline" aria-busy={removing || testing}>
      <ItemMedia variant="icon">
        <Icon aria-label={KIND_NAME[device.kind]} role="img" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <span className="truncate">{device.label}</span>
          {isThisDevice ? <Badge variant="secondary">This device</Badge> : null}
        </ItemTitle>
        <ItemDescription>{describeUse(device)}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          checked={enabled}
          disabled={removing}
          aria-label={`Receive push on ${device.label}`}
          onCheckedChange={(next) => submit({ intent: "device-enabled", enabled: String(next) })}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Send test notification to ${device.label}`}
          title="Send test notification"
          disabled={!pushConfigured || !enabled || testing || removing}
          onClick={() => submit({ intent: "test" })}
        >
          {testing ? <Spinner /> : <Send />}
        </Button>
        <RemoveDeviceDialog
          device={device}
          isThisDevice={isThisDevice}
          removing={removing}
          onConfirm={() => (isThisDevice ? onRemoveThisDevice() : submit({ intent: "device-remove" }))}
        />
      </ItemActions>
    </Item>
  );
}
