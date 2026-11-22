import { kit } from "./kit";
import { layout } from "./layout";
import { welcome } from "./messages/welcome";
import { streams } from "./streams";

/**
 * The app's mail, declared once (`@firesio/app/notify`, `.claude/rules/notify.md`). `createFiresio({ notify: notifications })` adds the D1 stores, the
 * delivery queue, the React Email renderer, the unsubscribe route and the package's own messages (support replies, invitations, the seats notice, the
 * team's announcements). Where mail goes out from is the app's `streams` (`./streams.ts`): a clone sends from `notification@` and `support@` its own domain.
 *
 *   streams   : purposes of sending, each an ordered list of senders (`./streams.ts`); a message names its stream (`stream: "customers"`, default `notifications`).
 *   lists     : what consent a recipient gave (`{ news: { owner: "platform", consent: { email: "opt-out" } } }`); a mail on consent needs a stream whose
 *               provider accepts it (Cloudflare Email carries transactional mail only) and a layout that shows `unsubscribeUrl` (this one does).
 *   resolve   : change a delivery's stream, recipient, language or reply-to before it is recorded:
 *                 resolve: [{ name: "shop-brand", run: async (delivery, cx) => ({ ...delivery, fromName: cx.services.brandOf(delivery.shop) }) }],
 *   guard     : app gates in order after the package's own (`canSpam`, `sendCaps`, `contentRules`, ... in the package's guard library); `scope: "sender"`
 *               for one about the sending side (a plan, a quota: a campaign pauses on it, `notify.explain` reports it):
 *                 guard: [canSpam({ postalAddress: (delivery, cx) => cx.services.addressOf(delivery.shop) })],
 *   on        : listeners for what happened to a delivery (`sent`, `delivered`, `failed`, `bounced`, `complained`, `skipped`), told at least once:
 *                 on: { failed: (event, cx) => cx.services.refundQuota(event.deliveryId) },
 *   inbound   : routes for mail that arrives at the app's own domain, by local part (`firesio.email` asks them before the support inbox).
 */
export const notifications = kit.defineNotify({
  messages: [welcome],
  layout,
  streams,
});
