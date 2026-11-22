import { kit } from "./kit";
import { layout } from "./layout";
import { welcome } from "./messages/welcome";

/**
 * The app's mail, declared once (`@firesio/app/notify`, `.claude/rules/notify.md`). `createFiresio({ notify: notifications })` adds what the app does not
 * have to write: the sender `app` (Cloudflare Email over the `EMAIL` binding, from `EMAIL_FROM` / `EMAIL_FROM_NAME`) and `support`
 * (`support@<mail domain>`), the D1 stores, the delivery queue, the React Email renderer, the unsubscribe route and the package's own messages
 * (support replies, invitations, the seats notice). So a clone of the template sends mail with no more configuration than the two vars.
 * No `EMAIL_FROM`, no sender, no mail: every send is recorded as `skipped:no_sender`, never an error.
 *
 *   senders   : { app: ... } is the package's; add one to send from another provider or address (`resend()` of `@firesio/app/notify/providers`).
 *   lists     : what consent a recipient gave (`{ news: { owner: "platform", consent: { email: "opt-out" } } }`); a mail on consent needs a sender
 *               that accepts it (Cloudflare Email carries transactional mail only) and a layout that shows `unsubscribeUrl` (this one does).
 *   resolve   : change a delivery's sender, recipient, language or reply-to before it is recorded:
 *                 resolve: [{ name: "shop-brand", run: async (delivery, cx) => ({ ...delivery, fromName: cx.services.brandOf(delivery.shop) }) }],
 *   guard     : app gates in order after the package's own (`canSpam`, `sendCaps`, `contentRules`, ... in the package's guard library):
 *                 guard: [canSpam({ postalAddress: (delivery, cx) => cx.services.addressOf(delivery.shop) })],
 *   on        : listeners for what happened to a delivery (`sent`, `delivered`, `failed`, `bounced`, `complained`, `skipped`), told at least once:
 *                 on: { failed: (event, cx) => cx.services.refundQuota(event.deliveryId) },
 *   inbound   : routes for mail that arrives at the app's own domain, by local part (`firesio.email` asks them before the support inbox).
 */
export const notifications = kit.defineNotify({
  messages: [welcome],
  layout,
  senders: {},
});
