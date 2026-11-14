import { membersContext, type MembersRouteDeps } from "@firesio/app-ui/members";
import { plansContext, type PlansRouteDeps } from "@firesio/app-ui/plans";
import { supportContext, type SupportRouteDeps } from "@firesio/app-ui/support";
import { can } from "@firesio/members";
import type { RouterContextProvider } from "react-router";
import { MEMBERS } from "~/core/members";
import { PLANS } from "~/core/plans";
import { localeOf } from "~/i18n/language";
import { membersLabels, plansLabels, supportLabels } from "~/i18n/labels";
import { admit, guardMember } from "./guard";
import { services, type Services } from "./services";

const UTC = "UTC";

/** The shop's own time zone (Shopify's), so the server render and the browser print the same date. */
async function zoneOf(s: Services, shop: string): Promise<string> {
  return (await s.shops.get(shop))?.timeZone ?? UTC;
}

/** `https://admin.shopify.com/store/<handle>/charges/<app handle>/pricing_plans`: Shopify's hosted plan page (Managed Pricing). */
export function pricingPlansUrl(shop: string, appHandle: string): string | null {
  const store = shop.endsWith(".myshopify.com") ? shop.slice(0, -".myshopify.com".length) : "";
  return store === "" || appHandle === "" ? null : `https://admin.shopify.com/store/${store}/charges/${appHandle}/pricing_plans`;
}

function supportDeps(s: Services): SupportRouteDeps {
  return {
    service: s.support,
    viewer: async (request) => {
      const { shop } = await guardMember(request, "app:view");
      const record = await s.shops.get(shop);
      const locale = localeOf(request);
      return { shop, shopName: record?.name ?? shop, merchantEmail: record?.email ?? null, locale, timeZone: record?.timeZone ?? UTC, labels: supportLabels(locale) };
    },
    basePath: "/app/support",
    now: s.runtime.now,
    newKey: s.runtime.uuid,
    reviewUrl: s.env.SHOPIFY_APP_HANDLE === "" ? null : `https://apps.shopify.com/${s.env.SHOPIFY_APP_HANDLE}#modal-show=ReviewListingModal`,
  };
}

function membersDeps(s: Services): MembersRouteDeps {
  return {
    members: s.members,
    seats: s.seats,
    config: MEMBERS,
    viewer: async (request) => {
      const { shop, member } = await guardMember(request, "members:manage");
      const locale = localeOf(request);
      return {
        member: { id: member.id, account: member.account, role: member.role, permissions: member.permissions },
        canChangePlan: can(member, "billing:manage", MEMBERS),
        locale,
        timeZone: await zoneOf(s, shop),
        labels: membersLabels(locale),
      };
    },
    visitor: async (request) => {
      // The kept-out page: ask again why. A person who is let in after all has nobody to describe, so go to the app.
      const { shop, access } = await admit(request);
      if (access.ok) throw new Response(null, { status: 302, headers: { Location: "/app" } });
      return { account: shop, reason: access.reason === "unavailable" ? "not_invited" : access.reason, labels: membersLabels(localeOf(request)) };
    },
    basePath: "/app/members",
    plansPath: "/app/plans",
    now: s.runtime.now,
    newId: s.runtime.uuid,
    log: (entry) => s.log({ ...entry }),
  };
}

function plansDeps(s: Services): PlansRouteDeps {
  return {
    plans: PLANS,
    billing: s.billing,
    usage: s.usage,
    meters: [
      { key: "tickets.max", source: { kind: "count", count: (shop) => s.openTicketCount(shop) } },
      { key: "mail.daily_max", source: { kind: "counter", counter: "mail.daily", period: "day" } },
    ],
    viewer: async (request) => {
      const { shop, member } = await guardMember(request, "app:view");
      const record = await s.shops.get(shop);
      const locale = localeOf(request);
      return { account: { domain: shop, shopifyShopId: record?.shopifyShopId ?? null }, canChangePlan: can(member, "billing:manage", MEMBERS), locale, timeZone: record?.timeZone ?? UTC, labels: plansLabels(locale) };
    },
    planUrl: async (viewer) => pricingPlansUrl(viewer.account.domain, s.env.SHOPIFY_APP_HANDLE),
    basePath: "/app/plans",
    now: s.runtime.now,
  };
}

/** The deps the route modules of `@firesio/app-ui` read from the router context. Set by the /app layout's middleware. */
export function provideAppUi(context: Pick<RouterContextProvider, "set">): void {
  const s = services();
  context.set(supportContext, supportDeps(s));
  context.set(membersContext, membersDeps(s));
  context.set(plansContext, plansDeps(s));
}
