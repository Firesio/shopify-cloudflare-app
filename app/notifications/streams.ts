import { appAddress, cloudflareEmail } from "@firesio/app/notify";
import { identity } from "~/core/identity";

/**
 * Where the app's mail goes out from, by purpose (`@firesio/app/notify`, "Stream"). Both go through Cloudflare Email over the `EMAIL` binding, from the app's own
 * domain (`SHOPIFY_APP_URL`, or `MAIL_DOMAIN` for local development): `notification@<domain>` and `support@<domain>`.
 *
 *   notifications : the app's own mail (the welcome) and the package's (member invitations, the seats notice, the team's announcements: service notices,
 *                   transactional, the only kind Cloudflare Email carries).
 *   support       : support replies; an answer comes back to the support inbox.
 *
 * Senders of a stream are tried in order, each with an optional `when(request, cx)` answering `true` or why not (a plan, a verified domain): an app adds a
 * stream (`customers`, `marketing`) or a sender in front (a shop's own domain over `resend()` of `@firesio/app/notify/providers`) without changing the package.
 * No `EMAIL` binding or no domain: the sender declines and every mail is recorded as `skipped:no_sender`, never an error.
 */
export const streams = (env: Env) => {
  const cloudflare = cloudflareEmail({ binding: env.EMAIL });
  return {
    notifications: { senders: [{ provider: cloudflare, from: appAddress("notification"), fromName: identity.name }] },
    support: { senders: [{ provider: cloudflare, from: appAddress("support"), fromName: identity.name }] },
  };
};
