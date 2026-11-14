import { defineContent, text, url, type Translations } from "@firesio/content";

/**
 * The texts the app sends (`@firesio/content`): which keys exist, the variables each takes and the rules a merchant edit
 * must keep. The words themselves are `TRANSLATIONS`, English complete: another language is another entry there
 * (`assertTranslationsComplete` in `content.test.ts` fails when a language lacks a key or a placeholder).
 *
 * Nothing here is `editable` by merchants: a merchant-facing mail is the app's voice. Add `editable: true` to a key (and mount
 * `@firesio/app-ui/content/list` and `/edit` in `routes.ts`) to let a shop reword it.
 */
export const CONTENT = defineContent({
  "mail.support_reply": {
    vars: { staffName: text(), subject: text(), excerpt: text(), ticketUrl: url(), appName: text() },
    parts: { subject: { max: 200 }, body: { multiline: true, max: 2000 } },
  },
  "mail.support_activity": {
    vars: { shopName: text(), subject: text(), excerpt: text(), ticketUrl: url() },
    parts: { subject: { max: 200 }, body: { multiline: true, max: 2000 } },
  },
});

export const FALLBACK_LOCALE = "en";

export const TRANSLATIONS: Translations = {
  en: {
    "mail.support_reply": {
      subject: "Re: {{subject}}",
      body: "{{staffName}} replied to your support ticket:\n\n{{excerpt}}\n\nRead and reply: {{ticketUrl}}\n\nReplying in the app keeps the whole conversation in one place. This email was sent by {{appName}} support.",
    },
    "mail.support_activity": {
      subject: "Support: {{shopName}} wrote about {{subject}}",
      body: "{{shopName}} wrote:\n\n{{excerpt}}\n\nOpen the thread: {{ticketUrl}}",
    },
  },
};
