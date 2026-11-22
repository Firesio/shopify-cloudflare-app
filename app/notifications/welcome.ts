import type { Notify } from "@firesio/app/notify";
import type { AppLinks } from "~/core/app-services";
import { welcome } from "./messages/welcome";

/** What sending the welcome needs: the shop's row (the address and language it gave), the kernel, the app's addresses. Handed in by the composition file's `on.installed`. */
export interface WelcomeDeps {
  readonly shops: { get(shop: string): Promise<{ readonly name: string | null; readonly email: string | null; readonly contactEmail: string | null; readonly primaryLocale: string | null } | null> };
  readonly notify: Pick<Notify<readonly [typeof welcome]>, "send">;
  readonly links: AppLinks;
}

/**
 * Welcomes a shop that just installed the app (`on.installed`): one transactional mail to the address the shop gave (its contact address, else the owner's), in the
 * shop's language when Shopify said it, and ONCE per shop (the dedupe key): an event handler is a job, so it may run again, and the kernel answers the repeat with the first
 * send's result. A shop with no known address gets nothing: the welcome is courtesy, never a reason to fail the install's job.
 */
export async function sendWelcome({ shops, notify, links }: WelcomeDeps, shop: string): Promise<void> {
  const record = await shops.get(shop);
  const email = record?.contactEmail ?? record?.email ?? null;
  if (record === null || email === null) return;
  await notify.send(welcome, {
    shop,
    to: { email, ...(record.primaryLocale === null ? {} : { locale: record.primaryLocale }) },
    vars: { shopName: record.name ?? shop, appUrl: links.openAppUrl(shop) },
    dedupeKey: `welcome:${shop}`,
  });
}
