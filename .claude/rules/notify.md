---
paths:
  - "app/notifications/**"
  - "app/routes/public/unsubscribe.tsx"
---

# Mail and every message the app sends (`@firesio/app/notify`)

The package is MECHANISM; this folder is the template's ready-made starting choice, which the app owns after copying: the layout, the sample message, the words, the hook
examples, the empty rules. Read `node_modules/@firesio/app/src/notify/README.md` for the lifecycle; the rules below are the template's.

- **React Email is the only way to write a mail.** A message is `kit.defineMessage({ id, vars (zod), email: { subject, body, preheader? } })`; the body is a React Email component
  (`@react-email/components`). No HTML strings, no template literals, no block builders (`defineMessages`, `b.text`, `template` are gone). The package's own mails (a support reply,
  an invitation, the seats notice) are React Email too and wear THIS layout.
- **Every text goes through `words.t(key)`** (and the layout through `I18N.translator(locale)`): the keys are `app/i18n/locales/<language>/app.json`, so the mail speaks the language
  of the shop and a derived app adds a language by adding a folder. A hard-coded sentence in a body is a bug. To let a merchant reword a mail, list the keys: `editable`, `removable`
  (the preset stores, validates and applies the edit).
- **The layout MUST show `unsubscribeUrl` when it is not null** (`app/notifications/layout.tsx`): a mail on consent whose render lacks it is refused at render. Transactional
  mail has none. A mail to customers needs the shop's postal address under the words (`canSpam`).
- **Zero config sends mail.** The preset adds the senders `app` (Cloudflare Email over `EMAIL`, from `EMAIL_FROM` / `EMAIL_FROM_NAME`) and `support`. With no `EMAIL_FROM` a send is
  recorded as `skipped:no_sender`, never an error. `NOTIFY_SECRET` (32+ characters) is REQUIRED: it keys the address hashes and signs the unsubscribe links, and changing it
  invalidates every link already sent.
- **Cloudflare Email carries transactional mail only.** A message with `basis: { consent: "<list>" }` (news, a campaign) needs a sender that accepts consent (`resend()` of
  `@firesio/app/notify/providers`) declared in `senders`, and a `lists` entry (owner, `opt-in` or `opt-out` per channel). `createNotify` refuses a declaration whose basis no
  sender can carry, at startup. Campaigns (`campaignDelivery`) are OFF in the template for this reason.
- **Send through the kernel, never around it**: `services.notify.send(message, { shop, to: { email, locale }, vars, dedupeKey })`. The `dedupeKey` is the same text every time the
  same mail is meant (`welcome:<shop>`): a job may run twice, the kernel answers the repeat with the first send's result. A send inside a D1 batch is `services.notify.statements(...)`
  (the outbox rows join the caller's batch). The outcome is a value per channel (`queued`, `skipped` with a reason, `failed`, `duplicate`): read it.
- **Hooks are the app's rules, and they are empty.** `resolve` (change sender, recipient, language, reply-to), `guard` (gates after the package's own: `canSpam`, `sendCaps`,
  `contentRules`), `beforeDispatch`, `on` (listeners for `sent`, `failed`, `bounced`, ... told at least once: idempotent), `inbound` (routes for mail to the app's own domain). Examples
  sit in the comment of `app/notifications/index.ts`. A hook reads `services` typed by `AppServices` (`kit.ts`); a package service reaches it through an app service built in `app/wiring/`.
- **The unsubscribe page is public** (`app/routes/public/unsubscribe.tsx`, `/unsubscribe?t=<signed token>`): a GET only SHOWS a button (mail scanners open links), a POST or a mail client's
  one-click POST (RFC 8058) unsubscribes, a forged link is a 400. Never put it behind a session.
- **Suppression is the kernel's**: a hard bounce or a complaint (Email Sending events on `<slug>-mail-events`) suppresses the address; keep "Drop suppressed recipients" OFF in Cloudflare so
  the package sees it. A STOP or an unsubscribe is a recorded consent, kept after `customers/redact` on purpose (erasing it would make the address mailable again).
- **Test with the real thing**: `testNotify` with `reactEmailRenderer()` and `i18nWords(I18N)` over a recording sender (`app/notifications/notifications.test.tsx`). Use an address on a
  real-looking domain: `.test` and `example.*` are skipped as `reserved_address`.
