import type { ShopInstalledPayload, ShopUninstalledPayload } from "~/notifications/payloads";
import { Cta, EmailLayout, Muted, P } from "../layout";
import { emailT } from "../translate.server";
import { renderEmail, type RenderedEmail } from "../render";

/**
 * Staff-facing: a shop installed or uninstalled the app. STAFF-FACING, so deliberately English — see
 * @rules/i18n.md.
 *
 * Both events carry the same facts, so they share one body and differ only in the words that say what happened. The
 * shop goes in the subject because this lands in a shared inbox where the subject is the only triage signal.
 */
async function shopChangeEmail(
  p: ShopInstalledPayload | ShopUninstalledPayload,
  words: { readonly subject: string; readonly happened: string },
): Promise<RenderedEmail> {
  const t = await emailT(p.locale);
  return renderEmail(
    `${words.subject}: ${p.shopName}`,
    <EmailLayout
      preview={`${p.shop} ${words.happened}`}
      heading={`${words.subject}: ${p.shopName}`}
      logoUrl={p.logoUrl}
      locale={p.locale} footer={t("senderDisclosure")}
    >
      <P>
        {p.shopName} ({p.shop}) {words.happened} on {p.occurredAt}.
      </P>
      <Cta href={p.adminUrl}>Open the shop</Cta>
      <Muted>
        You are getting this because shop notifications are on for your account. Change that under Notifications in
        the internal console.
      </Muted>
    </EmailLayout>,
  );
}

export function shopInstalledEmail(p: ShopInstalledPayload): Promise<RenderedEmail> {
  return shopChangeEmail(p, { subject: "New install", happened: "installed the app" });
}

export function shopUninstalledEmail(p: ShopUninstalledPayload): Promise<RenderedEmail> {
  return shopChangeEmail(p, { subject: "Uninstall", happened: "uninstalled the app" });
}
