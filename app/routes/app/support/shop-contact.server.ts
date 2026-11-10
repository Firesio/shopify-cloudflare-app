import { shopLog } from "~/observability/shop-log";
import { readShopContact } from "~/schemas/support";

/**
 * The shop's own contact details, so the merchant never types their own email.
 * `email` is the account owner's address — the person who installed the app and
 * the one who should receive replies. Validated against the 2026-10 schema.
 */
export const SHOP_CONTACT_QUERY = `#graphql
  query SupportShopContact {
    shop {
      name
      email
      contactEmail
    }
  }
`;

/** The Admin client as these helpers need it: one query, with the options that bound it. */
export type AdminGraphql = (query: string, options: { signal: AbortSignal; tries: number }) => Promise<Response>;

/** Both reads are decoration for a form that works without them, so neither may hold the merchant for long. */
const CONTACT_TIMEOUT_MS = 4_000;

/** The shop's name and reply address. Throws on a timeout or a failed call: callers decide what a failure costs. */
export async function fetchShopContact(graphql: AdminGraphql): Promise<{ name: string; email: string }> {
  const response = await graphql(SHOP_CONTACT_QUERY, { signal: AbortSignal.timeout(CONTACT_TIMEOUT_MS), tries: 1 });
  return readShopContact(await response.json());
}

/**
 * The name stored on a new ticket as its author. The ticket is worth more than its label, so a slow or failing Admin call
 * falls back to the shop's domain (logged) rather than losing or delaying the merchant's report.
 */
export async function shopNameFor(graphql: AdminGraphql, shop: string): Promise<string> {
  try {
    const contact = await fetchShopContact(graphql);
    return contact.name || shop;
  } catch (error) {
    await shopLog("admin.support.shop_name.failed", shop, {
      route: "app/support/new",
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return shop;
  }
}
