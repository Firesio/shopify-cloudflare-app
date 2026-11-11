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
- **Spam triage** (`.claude/rules/support-inbox.md`, "Spam"): none of it has run against real mail or a real model.
  - Whether Email Routing adds sender-authentication or spam headers we could use as a free first signal, and so verify the relay. Not looked up; today no `Authentication-Results` is read.
  - How long a `decision` call takes inside the `email` handler. The call has a 4 s timeout per model and walks the chain on a timeout, so the worst case is the chain length times 4 s. Measured once through the REST API on 2026-11-11 (6 short mails): 0.5 to 1.1 s for Clef, 0.3 to 0.5 s for Clef Flash, including the network. Not measured from inside a Worker.
  - The limits (5 mails per minute per sender, 500 decision calls per day) are estimates. Watch `ai_runs` for `support.spam_triage` (rows with `reason_code = rate_limited` mean the cap tripped) and the Spam page for wrongly held mail.
  - The model and the threshold (`SPAM_SCORE_HOLD_AT`, 0.9) were tried on six synthetic mails on 2026-11-11 and nothing more: SEO spam, phishing and a prompt-injection attempt scored 0.99 (Clef) and 0.94 to 0.96 (Clef Flash); real customers writing in English and Vietnamese, and a rude two-line complaint, scored 0.005 to 0.02. Not tried: other languages, long mail, borderline mail, whether the scores are calibrated. No labelled sample of real mail was run through it. Treat the first weeks of the Spam page as the evaluation, and raise the threshold if real mail turns up held.
  - Clef is called through `env.AI.run` with `questions` as a MAP of id to question (the schema at `developers.cloudflare.com/workers-ai/models/clef/schema-input.json`), and `clef-flash` is its own model id (`@cf/cloudflare/clef-flash`). Neither works through `workers-ai-provider` as far as the docs say; the AI Gateway option is not passed to it, because nothing says it is supported.
  - `SUPPORT_MAIL_LIMITER` is per Cloudflare location, like every rate-limit binding, so a sender hitting two locations gets two allowances.
