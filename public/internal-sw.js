/*
 * Service worker for the staff console's web push (/internal/**).
 *
 * Plain JavaScript on purpose: it is served as a static file (no build step) so
 * the browser can fetch it from a stable URL and byte-compare it for updates.
 * It is registered with scope /internal/ and never touches the merchant admin or
 * the public pages.
 *
 * Everything here runs with no UI and no session of its own, so it trusts
 * nothing it is handed: a push payload is parsed defensively, and the only URLs
 * a notification can ever open are same-origin paths under /internal/.
 */
"use strict";

/** Where a notification goes when its own URL is missing or not allowed. */
const FALLBACK_PATH = "/internal/dashboard";
const SUBSCRIBE_PATH = "/internal/notifications";
const ICON = "/internal-icons/icon-192.png";
const BADGE = "/internal-icons/badge.png";
/** A push the browser delivers must always be shown (userVisibleOnly), even when its body is unreadable. */
const GENERIC_TITLE = "New notification";
const MAX_TITLE = 120;
const MAX_BODY = 300;

function isInternalPath(pathname) {
  return pathname === "/internal" || pathname.startsWith("/internal/");
}

/**
 * The absolute URL to open for a notification: `raw` only when it resolves to this
 * origin under /internal/, otherwise the dashboard. Resolving through `URL`
 * first means `/internal/../x`, `//evil`, `javascript:` and `https://evil` are
 * judged by where they actually point, not by how they are spelled.
 */
function safeTarget(raw) {
  const origin = self.location.origin;
  const fallback = new URL(FALLBACK_PATH, origin).href;
  if (typeof raw !== "string" || raw === "") return fallback;
  let url;
  try {
    url = new URL(raw, origin);
  } catch {
    return fallback;
  }
  if (url.origin !== origin || !isInternalPath(url.pathname)) return fallback;
  return url.href;
}

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** What to show for a push event. Never throws: a bad or missing payload becomes a generic notification. */
function parseData(event) {
  try {
    return event.data ? event.data.json() : null;
  } catch {
    return null;
  }
}

function readPayload(event) {
  const raw = parseData(event);
  const payload = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    title: text(payload.title, MAX_TITLE) || GENERIC_TITLE,
    body: text(payload.body, MAX_BODY),
    url: safeTarget(payload.url),
    tag: text(payload.tag, 100),
    topic: text(payload.topic, 100),
  };
}

function notificationOptions(payload) {
  const options = {
    body: payload.body,
    icon: ICON,
    badge: BADGE,
    data: { url: payload.url, topic: payload.topic },
  };
  // `renotify` without a `tag` makes showNotification throw, so they travel together.
  if (payload.tag !== "") {
    options.tag = payload.tag;
    options.renotify = true;
  }
  return options;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Console windows that are open right now (same origin, under /internal/). */
async function consoleClients() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const origin = self.location.origin;
  return windows.filter((client) => {
    const url = new URL(client.url);
    return url.origin === origin && isInternalPath(url.pathname);
  });
}

/**
 * Tells open console windows that a push arrived. The operating system may still hide the banner (Focus Assist,
 * Do Not Disturb, browser notifications switched off in system settings), and then "sent" and "shown" are
 * indistinguishable to the person; this lets the page confirm delivery on its own.
 */
async function announceDelivery(payload) {
  try {
    for (const client of await consoleClients()) {
      client.postMessage({ type: "push-received", title: payload.title, topic: payload.topic });
    }
  } catch {
    // Telling the page is a courtesy: a failure here must never stop the notification from being shown.
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, notificationOptions(payload)),
      announceDelivery(payload),
    ]),
  );
});

/** A window already showing the console, if there is one. */
async function findConsoleClient() {
  return (await consoleClients())[0];
}

async function openOrFocus(target) {
  const existing = await findConsoleClient();
  if (existing) {
    try {
      const focused = await existing.focus();
      await (focused || existing).navigate(target);
      return;
    } catch {
      // `navigate` is refused for a window this worker does not control; open a new one instead.
    }
  }
  await self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  event.waitUntil(openOrFocus(safeTarget(data && data.url)));
});

/**
 * The browser rotated or dropped the subscription (the push service expired it,
 * or the key changed). Subscribe again with the same options and tell the server,
 * which replaces the old device row, so notifications keep arriving without the
 * person opening the console.
 */
async function resubscribe(event) {
  let subscription = event.newSubscription || null;
  if (subscription === null) {
    const old = event.oldSubscription ? event.oldSubscription.options : null;
    if (!old || !old.applicationServerKey) return;
    subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: old.applicationServerKey,
    });
  }
  await self.fetch(SUBSCRIBE_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ intent: "subscribe", subscription: JSON.stringify(subscription.toJSON()) }).toString(),
  });
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(resubscribe(event));
});
