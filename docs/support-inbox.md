# Support inbox — local trial and unverified items

Reference for `.claude/rules/support-inbox.md`. Not loaded automatically.

## Trying it locally (no deploy)

`npm run dev:local` serves the `email` handler too. Feed it a raw message at the local endpoint (the body must be RFC 5322 text and carry a `Message-ID`):

```bash
curl -X POST 'http://localhost:5179/cdn-cgi/local/email?from=jane@buyer.example&to=support@vip.firesio.app' --data-binary @mail.eml
```

Verified 2026-10-31: that opened an `email` ticket in the local D1 (`Worker successfully processed email`), and migration `0034` applied on the local D1. The app URL locally is a tunnel that cannot receive mail, so there is no `support+<id>@` address and mail is matched only by `In-Reply-To`/`References`. To exercise the address, put `SUPPORT_MAIL_DOMAIN=<domain>` in `.dev.vars`, reply to a ticket in the console, and send a mail to the `Reply-To` it printed. Email Sending itself is not simulated locally: a staff reply is queued and the channel refuses without `EMAIL_FROM`.

## Unverified — confirm before relying on it

- That Email Routing delivers mail sent to `support+<id>@` to a rule for `support@` (subaddressing). If not, mail still threads by `In-Reply-To` for threads the customer started, but not for replies to our mail.
- That the `messageId` `send()` returns equals the header Message-ID (it is not stored for that reason; `support_messages.mail_id` is reserved and unused).
- That Gmail and Outlook thread our reply under the customer's original mail from `In-Reply-To`/`References` alone.
- The relay parser is built from ONE sample (English). A changed Shopify template parses as `unparseable` and falls back to plain mail, so nothing a person wrote is lost.
