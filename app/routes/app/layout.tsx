import { boundary } from "@shopify/shopify-app-react-router/server";
import { localeIn } from "@firesio/app";
import { grantsOf } from "@firesio/app/members";
import { AppErrorBoundary } from "@firesio/app/ui/shell";
import { AdminFrame } from "@firesio/app/ui/frame";
import { platformOf } from "@firesio/app/notify/push";
import { lazy } from "react";
import type { HeadersFunction, LoaderFunctionArgs, MiddlewareFunction, ShouldRevalidateFunction } from "react-router";
import { Outlet, redirect, useLoaderData, useLocation } from "react-router";
import { AppNav } from "~/components/AppNav";
import { backOf } from "~/core/back";
import { opensAppWithoutShop } from "~/core/embedded-entry";
import { MEMBERS } from "~/core/members";
import { phoneItems } from "~/components/phone-items";
import { POLARIS_URL } from "~/core/polaris";
import { PWA } from "~/core/features";
import { firesio } from "~/firesio.server";
import { navLabelsOf } from "~/i18n/labels";

/**
 * One middleware guards all of /app: Shopify proves who is asking (`authenticate.admin`), the members library decides whether that
 * person may be here, a blocked shop is turned away, and the page modules of `@firesio/app/ui/*` get their deps through the router
 * context (`future.v8_middleware`). A person kept out is a PAGE (`/app/no-access`, which says why and who to ask), so the middleware
 * lets that one path through and sends everyone else on to it. The page's own permission is checked by that page's loader.
 */
export const middleware: MiddlewareFunction[] = [
  // The address typed by hand has no shop to authenticate: the landing page, not a blank App Bridge page or a bare 410.
  ({ request }, next) => {
    if (opensAppWithoutShop(request)) throw redirect("/");
    return next();
  },
  firesio.adminMiddleware,
];

/**
 * This layout hides what a member cannot use, but only to be kind. On the kept-out page there is no member (`maybeFrom` answers
 * `member: null`, where `from` would redirect to that very page): that is "no permissions", not an error.
 */
export async function loader({ context, request }: LoaderFunctionArgs) {
  const { member, services, shop, surface } = firesio.maybeFrom(context);
  // The menu's words, in the language of the request (the member's remembered language, `?locale=`, `Accept-Language`): a translator over the app's own words,
  // no read of any shop's layers (the menu is not something a merchant rewords), so nothing waits on the database here.
  const nav = navLabelsOf(services.i18n.translator(localeIn(services.i18n)(request, member?.locale ?? null)));
  // On a paired staff phone (`surface === "pwa"`, only while `PWA` is on) the frame draws the phone's shell instead; `platform` lets an iPhone's bars be glass from the first paint.
  const phone = PWA && surface === "pwa" ? { shop, platform: platformOf(request.headers.get("user-agent") ?? "", 0), items: [...phoneItems(nav)] } : null;
  // `surface` is where this request is drawn (the web admin, or the Shopify POS webview): `AdminFrame` draws the POS bar for `pos`.
  // The words of the surfaces with no loader of their own (the boundaries, the loading bar, the POS bar, the phone's chrome) in the same language. Only the phone needs the shop's
  // wording (`context`: a shop read); the web admin and POS use the in-memory translator, so this adds no I/O.
  const shellLabels = await firesio.shellLabels(phone === null ? { request } : { request, context });
  return { apiKey: services.env.SHOPIFY_API_KEY, permissions: member === null ? [] : [...grantsOf(member, MEMBERS)], surface, phone, nav, shellLabels };
}

/**
 * This shell's data is fixed for the lifetime of the embedded session, so client-side navigation between /app pages does not
 * re-run it. Safe for auth: the middleware runs on every request to /app, and every page loader and action checks its own permission.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({ formMethod, defaultShouldRevalidate }) => (formMethod ? defaultShouldRevalidate : false);

/** The phone's shell: its own chunk (`scripts/bundle-budget.mjs` measures it), requested only by a paired phone and only while the switch is on (`app/core/features.ts`). */
const PhoneLayout = PWA ? lazy(() => import("~/components/PhoneLayout")) : null;

export default function AppLayout() {
  const { apiKey, permissions, surface, phone, nav } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  // `AdminFrame` picks the shell the surface needs (the web admin and POS: App Bridge, Polaris, this menu, the POS bar; a paired phone: its own shell, a separate chunk
  // requested only by a phone and only while `PWA` is on). It adds no element of its own on the web admin.
  return (
    <AdminFrame
      surface={surface}
      apiKey={apiKey}
      polarisUrl={POLARIS_URL}
      back={backOf(pathname)}
      nav={<AppNav permissions={permissions} labels={nav} />}
      {...(phone !== null && PhoneLayout !== null ? { phone: { layout: PhoneLayout, shop: phone.shop, platform: phone.platform, items: phone.items } } : {})}
    >
      <Outlet />
    </AdminFrame>
  );
}

/**
 * Shopify needs React Router to catch some thrown responses so their headers reach the response. `AppErrorBoundary` renders
 * what a page's loader or action throws (a 403 from `requirePermission`) in Polaris, as the layout would, and a thrown success
 * response (App Bridge's session-token page) as the document it carries. An error the /app MIDDLEWARE throws (a blocked shop,
 * that same session-token page) never gets here: the router gives a middleware's error to the boundary of the shallowest route
 * with a loader, which is the root (`app/root.tsx`), so the root renders those too.
 */
export function ErrorBoundary() {
  return <AppErrorBoundary polarisUrl={POLARIS_URL} showDetails={import.meta.env.MODE === "development"} />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
