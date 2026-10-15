import type { NotificationPermissionState, PushEnvironment } from "./support";

/** The one place the browser's globals are read; everything else is given an environment. */
export function readNotificationPermission(): NotificationPermissionState | null {
  return typeof Notification === "undefined" ? null : Notification.permission;
}

function isStandalone(): boolean {
  const displayMode = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = "standalone" in navigator && navigator.standalone === true;
  return displayMode || iosStandalone;
}

export function readPushEnvironment(): PushEnvironment {
  return {
    secureContext: window.isSecureContext,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    permission: readNotificationPermission(),
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: isStandalone(),
  };
}
