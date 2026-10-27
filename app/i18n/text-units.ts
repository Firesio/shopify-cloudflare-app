// The pieces of text a reader sees as ONE thing, and the keys each needs. The shipped catalogues are complete for every
// unit (a test holds them to it); an app's override layers and extra languages can be partial, and the audience builder
// then shows the whole unit in a language that has all of it (else the default language).
import type { TextKey, TextUnits } from "~/lib/language/text";

/** What every email carries: the sender disclosure and the copy-the-link line. */
const EMAIL_LAYOUT: readonly TextKey[] = [
  { namespace: "email", key: "senderDisclosure" },
  { namespace: "email", key: "cta.copyLink" },
];

export const TEXT_UNITS = {
  "email.layout": EMAIL_LAYOUT,
  "email.support-reply": [
    ...EMAIL_LAYOUT,
    { namespace: "email", key: "support.reply.subject" },
    { namespace: "email", key: "support.reply.greeting" },
    { namespace: "email", key: "support.reply.intro" },
    { namespace: "email", key: "support.reply.cta" },
    { namespace: "email", key: "support.reply.footer" },
  ],
  // The loader-built page titles and descriptions of the public pages (the page body itself is rendered by react-i18next).
  "public.landing": [
    { namespace: "common", key: "appName" },
    { namespace: "public", key: "landing.heading" },
    { namespace: "public", key: "landing.lead" },
  ],
  "public.pricing": [
    { namespace: "common", key: "appName" },
    { namespace: "public", key: "pricing.heading" },
  ],
  "public.support": [
    { namespace: "common", key: "appName" },
    { namespace: "public", key: "support.heading" },
  ],
  "public.terms": [
    { namespace: "common", key: "appName" },
    { namespace: "public", key: "legal.terms.heading" },
  ],
  "public.privacy": [
    { namespace: "common", key: "appName" },
    { namespace: "public", key: "legal.privacy.heading" },
  ],
} as const satisfies TextUnits;

export type TextUnit = keyof typeof TEXT_UNITS;
