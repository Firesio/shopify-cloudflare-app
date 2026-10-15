import { useEffect, useState, useSyncExternalStore } from "react";
import { useFetcher } from "react-router";
import type { DeviceView, NotificationActionResult } from "~/domain/staff-notification-view";
import { readPushEnvironment } from "./environment";
import type { Result } from "~/lib/result";
import { disableBrowser, enableBrowser, readBrowser, type PushError } from "./subscription";
import { canEnablePush, pushSupport, type PushSupport, type PushSupportState } from "./support";

const NOTIFICATIONS_ACTION = "/internal/notifications";

type BrowserState =
  | { readonly phase: "loading" }
  | { readonly phase: "ready"; readonly endpointHash: string | null }
  | { readonly phase: "failed"; readonly error: PushError };

export type PushBusy = "idle" | "enabling" | "disabling";

function toBrowserState(outcome: Result<string | null, PushError>): BrowserState {
  return outcome.ok ? { phase: "ready", endpointHash: outcome.value } : { phase: "failed", error: outcome.reason };
}

/** What to show as busy: a browser step in progress, else the server call in flight. */
function busyFor(phase: PushBusy, serverIntent: FormDataEntryValue | null | undefined): PushBusy {
  if (phase !== "idle") return phase;
  if (serverIntent === "subscribe") return "enabling";
  return serverIntent === "device-remove" ? "disabling" : "idle";
}

export interface PushDevice {
  readonly support: PushSupportState;
  /** This browser's row among the person's devices, when its subscription is registered. */
  readonly thisDevice: DeviceView | null;
  /** The browser holds a subscription (it may not be registered with the server yet). */
  readonly subscribedHere: boolean;
  readonly busy: PushBusy;
  /** Why the last enable/disable failed in the browser; the server's own failures arrive in `result`. */
  readonly error: PushError | null;
  /** The server's answer to the last subscribe/remove. */
  readonly result: NotificationActionResult | undefined;
  /** Call from a click handler: the permission prompt needs the user gesture. */
  readonly enable: () => void;
  readonly disable: () => void;
}

/** The browser's current support, as a primitive so `useSyncExternalStore` sees a stable snapshot. */
function readSupport(): PushSupport {
  return pushSupport(readPushEnvironment());
}

const readServerSupport = (): PushSupportState => "checking";

/** Permission can change under the page (the person re-allows notifications in browser settings). */
function subscribeToPermission(onChange: () => void): () => void {
  if (typeof navigator === "undefined" || !navigator.permissions) return () => undefined;
  let status: PermissionStatus | null = null;
  let active = true;
  void navigator.permissions.query({ name: "notifications" }).then(
    (result) => {
      if (!active) return;
      status = result;
      result.addEventListener("change", onChange);
    },
    (error: unknown) => {
      console.warn(JSON.stringify({ event: "push.permission_watch_failed", message: String(error) }));
    },
  );
  return () => {
    active = false;
    status?.removeEventListener("change", onChange);
  };
}

/**
 * What the browser currently holds. The one effect in the hook, and it only READS: once support is
 * known it registers the worker and reads the subscription; everything that changes it afterwards is
 * an event handler.
 */
function useBrowserState(support: PushSupportState) {
  const state = useState<BrowserState>({ phase: "loading" });
  const setBrowser = state[1];

  useEffect(() => {
    if (!canEnablePush(support)) return;
    let active = true;
    void readBrowser().then((outcome) => {
      if (active) setBrowser(toBrowserState(outcome));
    });
    return () => {
      active = false;
    };
  }, [support, setBrowser]);

  return state;
}

/**
 * This browser's relationship to web push: can it, is it registered, and the two things a
 * person can do about it. Browser steps run in event handlers (never an effect); the one
 * effect only READS the current subscription once support is known.
 */
export function usePushDevice({
  publicKey,
  devices,
}: {
  readonly publicKey: string;
  readonly devices: readonly DeviceView[];
}): PushDevice {
  const fetcher = useFetcher<NotificationActionResult>();
  const support = useSyncExternalStore<PushSupportState>(subscribeToPermission, readSupport, readServerSupport);
  const [browser, setBrowser] = useBrowserState(support);
  const [phase, setPhase] = useState<PushBusy>("idle");
  const [error, setError] = useState<PushError | null>(null);

  const endpointHash = browser.phase === "ready" ? browser.endpointHash : null;
  const thisDevice = endpointHash === null ? null : (devices.find((device) => device.endpointHash === endpointHash) ?? null);

  const submit = (fields: Record<string, string>) => {
    void fetcher.submit(fields, { method: "post", action: NOTIFICATIONS_ACTION });
  };

  const enable = () => {
    void (async () => {
      setError(null);
      setPhase("enabling");
      // First await, straight from the click: this is what keeps the user gesture alive. The
      // permission the prompt leaves behind is picked up by the re-render that follows.
      const outcome = await enableBrowser(publicKey);
      setPhase("idle");
      if (!outcome.ok) return setError(outcome.reason);
      setBrowser({ phase: "ready", endpointHash: outcome.value.endpointHash });
      submit({ intent: "subscribe", subscription: outcome.value.subscriptionJson });
    })();
  };

  const disable = () => {
    void (async () => {
      setError(null);
      setPhase("disabling");
      const outcome = await disableBrowser();
      setPhase("idle");
      if (!outcome.ok) return setError(outcome.reason);
      setBrowser({ phase: "ready", endpointHash: null });
      if (thisDevice !== null) submit({ intent: "device-remove", id: thisDevice.id });
    })();
  };

  return {
    support,
    thisDevice,
    subscribedHere: endpointHash !== null,
    busy: busyFor(phase, fetcher.formData?.get("intent")),
    error: error ?? (browser.phase === "failed" ? browser.error : null),
    result: fetcher.data,
    enable,
    disable,
  };
}
