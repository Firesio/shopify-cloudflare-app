---
globs: ["app/notifications/**", "app/lib/web-push/**", "app/internal/push/**", "app/routes/internal/notifications*", "public/internal-sw.js"]
---

# Web push for the staff console

Staff (never merchants) can be notified in the browser, on phones and computers. What they hear about, and on which channel, is each person's own setting.

## How it fits together

- **Topics** (`app/domain/staff-notification-topics.ts`) are what a person sees in settings; **events** are what the system emits. One person's choice is an on/off per (topic, channel); no stored row means the topic's default. Adding a topic: one entry in `STAFF_TOPIC_SPECS`, an event/source that sends it, a test.
- **Push is a channel of the existing notification system** (`app/notifications/channels/push/`), not a second system. Recipient = a push SUBSCRIPTION ID; the endpoint and keys never travel in the queue or `notification_logs`.
- **Devices** (`push_subscriptions`, per admin, no `shop` column) each have their own on/off switch. A push goes to every enabled device of every person who has the topic on by push. 404/410 from the push service deletes the device.
- **Sources**: `SupportService.notifyStaff` (ticket opened / merchant reply), `afterAuth` (new install; announced only for a shop with no row or one that had uninstalled, because afterAuth also fires on token renewals), `recordUninstall` (outcome `recorded`). The Partner-history reconcile never announces (it back-fills).
- **Crypto** is ours, in `app/lib/web-push/` (RFC 8291 + 8188 aes128gcm, RFC 8292 VAPID), tested against the RFC 8291 Appendix A vector. `web-push` from npm does not run on Workers.
- **The browser never waits forever**: `pushManager.subscribe` can stay pending (Chromium without Google services, Brave with push off), so it is bounded by `SUBSCRIBE_TIMEOUT_MS` and reports `push-service-timeout`.

## Security decisions (ours, not Shopify's)

- The Worker POSTs to whatever endpoint a staff member registers, so `isAllowedPushEndpoint` (`app/domain/push-device.ts`) is an SSRF allowlist (FCM, Mozilla, Apple, Windows). A browser whose push service is not listed fails closed.
- Registration and removal actions require the authoritative admin session and a same-origin `Origin`.
- Never log an endpoint, key or payload; log host + status + event name.

## Configuration and deploy

- `VAPID_PUBLIC_KEY` is a `vars` entry (top level AND `env.production`). `VAPID_PRIVATE_KEY` is a secret that is deliberately NOT in `secrets.required` (a missing required secret fails the deploy; push is optional). Without both, push is simply unavailable and the settings page says so.
- Wrangler loads only declared names from `.dev.vars` once a `secrets` block exists (Cloudflare docs, `secrets` configuration property), so the top-level `vars` carries an empty `VAPID_PRIVATE_KEY` slot for local dev only. `env.production` must NOT declare it.
- Generate once with `npm run push:keys`, then in production: public key into `env.production.vars`, `npx wrangler secret put VAPID_PRIVATE_KEY --env production`. Changing the pair invalidates every browser subscription.
- The VAPID subject is `SHOPIFY_APP_URL`, which must be `https://` (`vapidConfig` refuses otherwise, so plain `http://localhost` leaves push off in dev: run with an https URL).

## What is and is not verified

Verified: crypto against the RFC vector, sender against a fake `fetch`, the full local path against the real FCM host with a fake token (FCM answered 410 and the device was removed), the settings UI in Chromium at desktop and phone widths, the service worker registering and activating under `/internal/`.

NOT verified: a real browser subscription delivering a notification (headless Chromium cannot subscribe: no Google services), Firefox, Safari, and iOS (web push there only works from an installed Home Screen web app). Test those by hand on a device before relying on them.
