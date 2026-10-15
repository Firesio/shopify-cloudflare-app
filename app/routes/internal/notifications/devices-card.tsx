import { useFetcher } from "react-router";
import { Bell, Send } from "lucide-react";
import type { NotificationActionResult, NotificationSettingsView } from "~/domain/staff-notification-view";
import { Button } from "~/internal/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/internal/components/ui/empty";
import { ItemGroup } from "~/internal/components/ui/item";
import { Spinner } from "~/internal/components/ui/spinner";
import { usePushDevice } from "~/internal/push/use-push-device";
import { useActionToast } from "~/internal/use-action-toast";
import { BrowserPanel } from "./browser-panel";
import { DeviceRow } from "./device-row";
import { describeResult, PUSH_ERROR_MESSAGES } from "./messages";

const NOTIFICATIONS_ACTION = "/internal/notifications";

/** The test-every-device button, with its own fetcher so it never shares a pending state with a row. */
function TestAllButton({ view }: { readonly view: NotificationSettingsView }) {
  const fetcher = useFetcher<NotificationActionResult>({ key: "device:test-all" });
  useActionToast(fetcher.data, describeResult(fetcher.data));
  const testing = fetcher.state !== "idle";
  const anyEnabled = view.devices.some((device) => device.enabled);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!view.push.configured || !anyEnabled || testing}
      onClick={() => void fetcher.submit({ intent: "test" }, { method: "post", action: NOTIFICATIONS_ACTION })}
    >
      {testing ? <Spinner /> : <Send />}
      Send test notification
    </Button>
  );
}

export function DevicesCard({ view }: { readonly view: NotificationSettingsView }) {
  const push = usePushDevice({ publicKey: view.push.publicKey, devices: view.devices });
  // The toast layered on the inline messages in BrowserPanel; the Alert stays the authoritative one.
  useActionToast(push.result, describeResult(push.result));
  useActionToast(push.error, push.error === null ? undefined : { error: PUSH_ERROR_MESSAGES[push.error] });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices that receive push</CardTitle>
        <CardDescription>
          Phones, tablets and computers you have enabled. Register each one from that device; a push goes to every device
          that is switched on.
        </CardDescription>
        <CardAction>
          <TestAllButton view={view} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {push.thisDevice === null ? <BrowserPanel push={push} view={view} /> : null}
        {view.devices.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell />
              </EmptyMedia>
              <EmptyTitle>No devices yet</EmptyTitle>
              <EmptyDescription>Devices you enable show up here, and you can switch each one on or off.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-3">
            {view.devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                isThisDevice={push.thisDevice?.id === device.id}
                pushConfigured={view.push.configured}
                onRemoveThisDevice={push.disable}
                removingThisDevice={push.busy === "disabling"}
              />
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
