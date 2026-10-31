---
globs: ["app/support/**", "app/services/support*", "app/models/support*", "app/ports/support*", "app/adapters/inbound-mail*", "app/adapters/bot-check*", "workers/inbound-email*", "app/routes/public/support*", "app/routes/internal/support/**"]
---

# Support inbox — one conversation model, many sources

Support is ONE conversation model with several places a conversation can start. Staff answer all of them the same way, from the internal console; the email part (who gets it, in which thread, how a reply comes back) is the backend's job.

## The two paths

```
IN   mail / form / portal → parse (edge) → ReceiveInbound → find the thread (or open one) → store (idempotent) → alert staff
OUT  staff Reply → ReplyToThread → store → pick channels by source → enqueue mail (dedupe key) → send
```

No source has its own path. Source-specific behaviour lives in two registries:

| Registry | File | Decides |
|---|---|---|
| Mail sources (`MAIL_SOURCES`) | `app/support/inbound/sources.ts` | Which source claims a new mail, and how it becomes a `NormalizedInbound`. The plain-email source is the last entry and always matches |
| Source delivery (`SOURCE_DELIVERY`) | `app/support/inbound/delivery.ts` | Where a reply goes, which channels carry it, and who owns the first mail in the thread (`rootOrigin`) |

**Adding a source = one entry in each registry that applies, plus a test.** `SupportSource` is a closed union, so `SOURCE_DELIVERY` stops compiling until the new source says where its replies go. If your change also edits `SupportInboxService.receive` or `SupportService.notifyCustomer`, you applied it wrong.

Sources today: `app_portal`, `shopify_relay`, `email`, `web_form`. `author` on a message is `merchant` (the CUSTOMER side, whoever they are) or `staff`; there is deliberately no third value.

## Threading — what Cloudflare lets us do (verified 2026-10-31)

Read from the Cloudflare Email Service docs ([headers](https://developers.cloudflare.com/email-service/reference/headers/), [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)):

- `In-Reply-To` and `References` are on the allowlist and may be set. **`Message-ID` is platform-controlled and cannot be set** (`E_HEADER_NOT_ALLOWED`); a send is rejected whole if any header is not allowed.
- So a reply's thread is found by **`support+<ticketId>@<app domain>`** (the Reply-To we set), not by a Message-ID we invent. `References` is built only from mail ids the customer's own mailbox has: `referenceableMessageIds` leaves out the opening message of a thread whose first mail was ours (the Shopify relay mail never reached the asker).
- A message may be added to a thread only by someone already in it (`senderMayPost`): the `+id` address is guessable once seen. Anyone else becomes a NEW unassigned conversation, never a line in someone else's thread.

## Data

- `support_tickets.shop` and `support_messages.shop` are **nullable**. A NULL never equals a shop, so every shop-scoped query and `purgeShop` pass over unassigned rows by construction. `SupportInboundRepo.assignShop` is the only way from NULL to a shop, and it refuses a thread that already has one. `support_attachments.shop` stays NOT NULL: files need an owner, so staff attachments on an unassigned thread are refused before the reply is written.
- `support_messages.external_id` (the mail's own `Message-ID`, normalised) is UNIQUE: the same mail arriving twice is one message.
- Migration `0034` was **edited by hand** after `drizzle-kit generate`: the generated one selected columns the old tables lack, and dropped the parent table first, which on D1 (foreign keys enforced, `PRAGMA foreign_keys` ignored) would cascade-delete messages and attachments. It backs up and drops children first. Verified against SQLite with foreign keys on and real rows. Not run on a real D1.

## Receiving mail

- Cloudflare Email Routing delivers to the Worker's `email` handler (`workers/inbound-email.ts`): parse (`postal-mime`), hand to `SupportInboxService.receive`, answer. A mail we cannot read or store is **rejected** so the sender is bounced; a mail we choose to ignore (auto-reply, our own domain) is **accepted and dropped** — bouncing it would start a loop.
- Only the text/plain part is read. The HTML part's links are tracking redirects.
- **Sender verification**: `Authentication-Results` is a header a sender can forge, so it is trusted only from the receiver named by `INBOUND_AUTH_SERVER_ID`. Empty (the default) trusts none: mail is stored, no sender counts as verified, and the Shopify relay is read as plain mail. Set it to the authserv-id seen on a real delivery.
- Mail is never stored for a stranger beyond the conversation row; the body is cut at `INBOUND_BODY_MAX`, and no address or body is logged.

## The public form

`/support` (`app/routes/public/support.tsx`, logic in `support-contact.server.ts`). Order, cheapest refusal first: decoy field (answered as a success) → Zod parse → per-IP limiter (`SUPPORT_FORM_LIMITER`, fails open when absent) → Turnstile (`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`) → write → redirect (post/redirect/get). A site key without its secret **refuses** every submission rather than skipping the check; an empty site key (local dev) skips it. The page's CSP is the only one that allows Cloudflare's Turnstile script and frame. The form sends no confirmation email: that would be a second spam vector.

## Two voices

- **Conversation mail** (a staff reply in a thread) is sent FROM `support@<app domain>` with `Reply-To: support+<id>@<app domain>` and the threading headers. `SupportService.notifyCustomer` sets `from` on the payload; `EmailChannel` uses it instead of the default sender.
- **Automatic mail** (password reset, staff alerts) is sent from `EMAIL_FROM` (the optional "notifications" address) with no override. `EMAIL_FROM` empty still means email is off for everything, whatever `from` a message names.
- Both addresses must be on a domain onboarded to Email Sending. A subdomain is onboarded separately from its parent: `support@vip.firesio.app` needs `vip.firesio.app` itself, not only `firesio.app`.

## Configuration

- Support mail domain = the host of `SHOPIFY_APP_URL` (`supportMailDomain`); a URL that cannot receive mail (localhost, workers.dev, an IP) leaves the reply address off.
- Set up per app: onboard the app's subdomain to Email Routing, route `support@` (and `support+*` if subaddressing is on) to this Worker, point the app listing's contact email at `support@<app domain>`. `EMAIL_FROM` for the notifications sender is separate and optional.

## Trying it locally (no deploy)

`npm run dev:local` serves the `email` handler too. Feed it a raw message at the local endpoint (the body must be RFC 5322 text and carry a `Message-ID`):

```bash
curl -X POST 'http://localhost:5179/cdn-cgi/local/email?from=jane@buyer.example&to=support@vip.firesio.app' --data-binary @mail.eml
```

Verified 2026-10-31: that opened an `email` ticket in the local D1 (`Worker successfully processed email`), and migration `0034` applied on the local D1. The app URL locally is a tunnel that cannot receive mail, so there is no `support+<id>@` address and mail is matched only by `In-Reply-To`/`References`. To exercise the address, put `SUPPORT_MAIL_DOMAIN=<domain>` in `.dev.vars`, reply to a ticket in the console, and send a mail to the `Reply-To` it printed. Email Sending itself is not simulated locally: a staff reply is queued and the channel refuses without `EMAIL_FROM`.

## Unverified — confirm before relying on it

- That Email Routing delivers mail sent to `support+<id>@` to a rule for `support@` (subaddressing). If not, mail still threads by `In-Reply-To` for threads the customer started, but not for replies to our mail.
- That the Email Worker receives an `Authentication-Results` header, and what its authserv-id is.
- That the `messageId` `send()` returns equals the header Message-ID (it is not stored for that reason; `support_messages.mail_id` is reserved and unused).
- That Gmail and Outlook thread our reply under the customer's original mail from `In-Reply-To`/`References` alone.
- The relay parser is built from ONE sample (English). A changed Shopify template parses as `unparseable` and falls back to plain mail, so nothing a person wrote is lost.
