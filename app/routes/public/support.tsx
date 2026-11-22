import { localeIn } from "@firesio/app";
import { contactContext, contactLabelsOf } from "@firesio/app/ui/support";
import Contact from "@firesio/app/ui/support/contact";
import type { MiddlewareFunction } from "react-router";
import { identity } from "~/core/identity";
import { firesio } from "~/firesio.server";

/**
 * The public contact form is the library's route module: its `loader` and `action` (the honeypot, the field checks, the rate limit,
 * Turnstile, the inbox; a body whose declared length is over 64 KB is refused with 413 before it is read) with this app's words and
 * Turnstile key, set per request. `service` is null while support is off (`support: false` in firesio.server.ts) and the page then
 * answers 503. Only the frame around the form is the app's: the placeholder below goes when the real help text is written.
 */
export { action, loader } from "@firesio/app/ui/support/contact";

export const middleware: MiddlewareFunction[] = [
  ({ context, request }, next) => {
    const { contact, i18n, supportTurnstileSiteKey } = firesio.services();
    // The form's words are the catalogue's (`firesio:contact.*`, English, Spanish and German from the package; the app's `firesio.json` swaps any), in the visitor's language.
    // The widget's site key is the preset's (`support.turnstile`, default the two vars).
    context.set(contactContext, { service: contact, labels: contactLabelsOf(i18n.translator(localeIn(i18n)(request))), turnstileSiteKey: supportTurnstileSiteKey });
    return next();
  },
];

/** The public support page: the App Store checklist expects real support resources linked from the listing. */
export default function Support() {
  return (
    <section className="section">
      <div className="prose stack">
        <h1>Support</h1>
        <p className="muted">Help with {identity.name}</p>
        <p className="notice notice--warning">Placeholder. Replace with real, Shopify-specific help: setup steps, common problems and how to reach you.</p>
        <Contact />
      </div>
    </section>
  );
}
