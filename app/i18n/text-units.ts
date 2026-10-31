// The pieces of text a reader sees as ONE thing, and the keys each needs. A unit IS a type: `audienceTextFor("email.layout")`
// returns a translator whose keys are exactly the ones listed here, so a key the unit does not list does not compile (and
// so can never render as a raw key). The shipped catalogues are complete for every unit (a test holds them to it); an
// app's override layers and extra languages can be partial, and the audience builder then shows the whole unit in a
// language that has all of it (else the default language).
import type { CatalogueKeys, Namespace, PluralKeys } from "./catalogues.generated";

/**
 * One key of one namespace, typed against the generated key unions. A plural group (`items` for `items_one`,
 * `items_other`...) must say `plural: true`, and only a plural group may.
 */
export type UnitKey = {
  [N in Namespace]:
    | { readonly namespace: N; readonly key: Exclude<CatalogueKeys[N], PluralKeys[N]>; readonly plural?: never }
    | { readonly namespace: N; readonly key: PluralKeys[N]; readonly plural: true };
}[Namespace];

/** What every email carries: the sender disclosure and the copy-the-link line. */
const EMAIL_LAYOUT = [
  { namespace: "email", key: "senderDisclosure" },
  { namespace: "email", key: "cta.copyLink" },
] as const satisfies readonly UnitKey[];

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
    { namespace: "public", key: "landing.heading" },
    { namespace: "public", key: "landing.lead" },
  ],
  "public.pricing": [{ namespace: "public", key: "pricing.heading" }],
  "public.support": [{ namespace: "public", key: "support.heading" }],
  "public.terms": [{ namespace: "public", key: "legal.terms.heading" }],
  "public.privacy": [{ namespace: "public", key: "legal.privacy.heading" }],
} as const satisfies Readonly<Record<string, readonly UnitKey[]>>;

export type TextUnit = keyof typeof TEXT_UNITS;

/** The keys of one unit: the type an `AudienceText` is parameterised by. */
export type UnitKeys<U extends TextUnit> = (typeof TEXT_UNITS)[U][number];
