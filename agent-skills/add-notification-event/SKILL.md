---
name: add-notification-event
description: Add a notification event (email and/or staff push) end to end: union, catalogue, payload, schema, template, text unit, translations, sender. Use when the app must send a new email or push, or change one.
---

# Add a notification event

Every step is compiler-guided: the build fails until each map has the new event. Staff push topics: `.claude/rules/web-push.md`. Language rules: `.claude/rules/i18n.md`.

1. **Event name**: add it to `NotificationEvent` in `app/notifications/types.ts` (a closed union on purpose).
2. **Spec**: `EVENTS` in `app/notifications/catalogue.ts`: `audience` (customer, merchant or staff), `gate` (`essential`, `preference`, `caller_gated`) and `channels`. Staff-facing events skip recipient consent, so do not mix audiences.
3. **Payload type**: a payload interface and its entry in `PayloadByEvent` in `app/notifications/payloads.ts`.
4. **Wire schema**: a Zod object for it in `app/notifications/envelope.ts`, and the event in `EVENT_KEYS`. A message queued before a field existed must still parse (`.default(...)`/`.optional()` for new fields).
5. **Email** (skip for push-only; then set `null` in `BUILDERS`, which a test holds to the catalogue's `channels`): a template in `app/emails/templates/<name>.tsx` with a test, and the event in both maps of `app/emails/registry.server.ts`: `EMAILS` (text `unit` + language source: `STAFF` fixed default language, or `MERCHANT`) and `BUILDERS`.
6. **Text unit**: if the email uses new copy, declare the exact keys in `app/i18n/text-units.ts` (a builder can only use its unit's keys), then add them to `app/i18n/locales/<lang>/email.json` for **every** language and run `npm run i18n:sync`.
7. **Staff push**: a topic in `STAFF_TOPIC_SPECS` (`app/domain/staff-notification-topics.ts`) and a source that sends it.
8. **Sending**: through the notifier with a **deterministic dedupe key** built from the delivery or event (never random: handlers run again on retry). Use the hand-off variant only when the caller must know the message was queued.
9. **Tests**: the template render, the envelope parse, and the sender via `app/test/fake-notifier.ts`. Use a recipient domain you own, never `@example.com`.
10. `npm run verify`.
