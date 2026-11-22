# Migrating an app to `@firesio/app` 3.0

The package's own guide is its 3.0.0 changelog entry (`node_modules/@firesio/app/CHANGELOG.md`, ticket 36 of `platform`). This is the checklist for an app derived from
the template, in order.

1. `npm install @firesio/app@^3.0.0` (with the token in the environment, never in a file).
2. `app/notifications/streams.ts`: copy the template's. Add the app's own streams there (a `customers` stream whose first sender is a shop's own domain under a `when`, a
   `texting` stream over the shop's numbers). A condition (a plan, a verified domain) is a `when(request, cx)` answering `true` or the reason: app code.
3. `app/notifications/index.ts`: `streams` replaces `senders`. `kit.ts`: `notifyKit<AppServices, Env>()`.
4. Messages: `sender` / `senderByChannel` are gone; a message that is not on `notifications` names its `stream`. A resolve hook that set `sender` sets `stream`.
5. Guards about the sending side (a plan, a quota, a shop's standing) get `scope: "sender"`: a campaign then pauses on them and `notify.explain` reports them.
6. Pages that predicted the kernel ("is mail set up", "would this mail go") ask `services.notify.explain({ message, shop })` instead.
7. `wrangler.jsonc` (both environments): delete `EMAIL_FROM`, `EMAIL_FROM_NAME`; rename `SUPPORT_MAIL_DOMAIN` to `MAIL_DOMAIN`; `npx wrangler types`.
8. `campaignDelivery`: drop `sender` and `shopSender`. Announcements default to service notices on `notifications` (transactional, Cloudflare). An app whose merchants
   write to their own customers (`customers`) names `shopStream`, a stream over a provider that accepts consent.
9. `npm run verify`, then the production build.
