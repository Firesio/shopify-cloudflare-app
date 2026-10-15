import { BellOff, BellRing, CircleAlert, Info, Share, TriangleAlert } from "lucide-react";
import type { NotificationSettingsView } from "~/domain/staff-notification-view";
import { Alert, AlertDescription, AlertTitle } from "~/internal/components/ui/alert";
import { Button } from "~/internal/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "~/internal/components/ui/item";
import { Spinner } from "~/internal/components/ui/spinner";
import type { PushDevice } from "~/internal/push/use-push-device";
import { ERROR_MESSAGES, PUSH_ERROR_MESSAGES } from "./messages";

/** The failure to show in place, so it survives the toast: the browser's own, else the server's answer. */
function failureMessage(push: PushDevice): string | undefined {
  if (push.error !== null) return PUSH_ERROR_MESSAGES[push.error];
  if (push.result !== undefined && "error" in push.result) return ERROR_MESSAGES[push.result.error];
  return undefined;
}

function IosInstallSteps() {
  return (
    <Alert>
      <Share />
      <AlertTitle>Add the console to your Home Screen first</AlertTitle>
      <AlertDescription>
        <p>On iPhone and iPad, notifications only work from an installed web app, not from a Safari tab.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Open this page in Safari and tap the Share button.</li>
          <li>Choose Add to Home Screen, then tap Add.</li>
          <li>Open the console from its Home Screen icon, come back to this page, and enable notifications.</li>
        </ol>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Why this browser cannot be enabled, or null when it can. One reason at a time, the
 * one the person can act on first. The settings the server reports come before the
 * browser's: a deployment without push keys cannot be fixed from here.
 */
function blocker({ push, view }: { readonly push: PushDevice; readonly view: NotificationSettingsView }) {
  if (!view.push.configured) {
    return (
      <Alert>
        <Info />
        <AlertTitle>Push is not set up</AlertTitle>
        <AlertDescription>
          This deployment has no push keys, so no device can be registered. Ask whoever deploys the console to configure them.
        </AlertDescription>
      </Alert>
    );
  }
  switch (push.support) {
    case "unsupported":
      return (
        <Alert>
          <BellOff />
          <AlertTitle>This browser cannot receive push</AlertTitle>
          <AlertDescription>
            Use a current Chrome, Edge, Firefox or Safari over HTTPS, on a phone or a computer. Private windows may not allow it.
          </AlertDescription>
        </Alert>
      );
    case "ios-needs-install":
      return <IosInstallSteps />;
    case "denied":
      return (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Notifications are blocked for this site</AlertTitle>
          <AlertDescription>
            <p>
              Allow them in your browser: open the site settings (the lock or tune icon beside the address, or Settings,
              then Site settings, then Notifications), set this site to Allow, then reload this page.
            </p>
          </AlertDescription>
        </Alert>
      );
    case "checking":
    case "default":
    case "granted":
      break;
  }
  if (view.devices.length >= view.push.maxDevices) {
    return (
      <Alert>
        <Info />
        <AlertTitle>Device limit reached</AlertTitle>
        <AlertDescription>
          You can register up to {view.push.maxDevices} devices. Remove one below to add this browser.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

/**
 * This browser's way in: either what stops it (an Alert) or the Enable button. Shown
 * only while the browser is not registered yet; once it is, it appears in the device
 * list below with a "This device" badge instead.
 */
export function BrowserPanel({ push, view }: { readonly push: PushDevice; readonly view: NotificationSettingsView }) {
  const failure = failureMessage(push);
  const stopped = blocker({ push, view });
  const busy = push.busy !== "idle";
  const checking = push.support === "checking";

  return (
    <div className="flex flex-col gap-3">
      {failure !== undefined ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}
      {stopped ?? (
        <Item variant="muted">
          <ItemMedia variant="icon">
            <BellRing />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Receive notifications on this device</ItemTitle>
            <ItemDescription>
              {push.support === "granted"
                ? "This browser already allows notifications. One tap registers it."
                : "Your browser will ask for permission when you continue."}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button onClick={push.enable} disabled={busy || checking}>
              {busy ? <Spinner /> : null}
              Enable on this device
            </Button>
          </ItemActions>
        </Item>
      )}
    </div>
  );
}
