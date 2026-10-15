import { useEffect } from "react";
import { toast } from "sonner";

interface PushReceived {
  readonly type: "push-received";
  readonly title: string;
}

function isPushReceived(value: unknown): value is PushReceived {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "push-received" &&
    "title" in value &&
    typeof value.title === "string"
  );
}

/**
 * Confirms, inside the page, that a push reached this browser. The service worker posts a message to open console
 * windows when it receives one. The operating system can still hide the banner (Focus Assist, Do Not Disturb,
 * browser notifications off in system settings); without this the person cannot tell "never arrived" from "arrived
 * but hidden". Subscribes to the worker's message channel, which is why it is an effect and holds no state.
 */
export function usePushDelivery(): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const worker = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      if (isPushReceived(event.data)) toast.success("Delivered to this device", { description: event.data.title });
    };
    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, []);
}
