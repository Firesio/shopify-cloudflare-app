import { boundary } from "@shopify/shopify-app-react-router/server";
import { grantsOf } from "@firesio/app/members";
import { AppErrorBoundary, EmbeddedProvider } from "@firesio/app/ui/shell";
import { platformOf } from "@firesio/app/notify/push";
import { AppSurface } from "@firesio/app/ui/surface";
import { lazy, Suspense } from "react";
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
export const loader = ({ context, request }: LoaderFunctionArgs) => {
  const { member, services, shop, surface } = firesio.maybeFrom(context);
  // On a paired staff phone (`surface === "pwa"`, only while `PWA` is on) the layout draws the phone's shell instead; `platform` lets an iPhone's bars be glass from the first paint.
  const phone = PWA && surface === "pwa" ? { shop, platform: platformOf(request.headers.get("user-agent") ?? "", 0), items: [...phoneItems()] } : null;
  // `surface` is where this request is drawn (the web admin, or the Shopify POS webview): `AppSurface` below draws the POS bar for `pos`.
  return { apiKey: services.env.SHOPIFY_API_KEY, permissions: member === null ? [] : [...grantsOf(member, MEMBERS)], surface, phone };
};

/**
 * This shell's data is fixed for the lifetime of the embedded session, so client-side navigation between /app pages does not
 * re-run it. Safe for auth: the middleware runs on every request to /app, and every page loader and action checks its own permission.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({ formMethod, defaultShouldRevalidate }) => (formMethod ? defaultShouldRevalidate : false);

/** The phone's shell: its own chunk (`scripts/bundle-budget.mjs` measures it), requested only by a paired phone and only while the switch is on (`app/core/features.ts`). */
const PhoneLayout = PWA ? lazy(() => import("~/components/PhoneLayout")) : null;

export default function AppLayout() {
  const { apiKey, permissions, surface, phone } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  if (phone !== null && PhoneLayout !== null) {
    return (
      <Suspense fallback={null}>
        <PhoneLayout shop={phone.shop} platform={phone.platform} items={phone.items}>
          <Outlet />
        </PhoneLayout>
      </Suspense>
    );
  }
  // `AppSurface` draws nothing of its own on the web admin (no element, no style, no request): only inside POS does it add the bar.
  return (
    <EmbeddedProvider apiKey={apiKey} polarisUrl={POLARIS_URL}>
      <AppNav permissions={permissions} />
      <AppSurface surface={surface} back={backOf(pathname)}>
        <Outlet />
      </AppSurface>
    </EmbeddedProvider>
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
