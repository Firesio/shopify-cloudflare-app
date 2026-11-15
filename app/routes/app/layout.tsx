import { boundary } from "@shopify/shopify-app-react-router/server";
import { grantsOf } from "@firesio/app/members";
import type { HeadersFunction, LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { isRouteErrorResponse, Outlet, useLoaderData, useRouteError } from "react-router";
import { AppNav } from "~/components/AppNav";
import { EmbeddedProvider } from "~/components/EmbeddedProvider";
import { thrownResponseHtml } from "~/components/thrown-response";
import { MEMBERS } from "~/core/members";
import { firesio } from "~/firesio.server";

/**
 * One middleware guards all of /app: Shopify proves who is asking (`authenticate.admin`), the members library decides whether that
 * person may be here, a blocked shop is turned away, and the page modules of `@firesio/app/ui/*` get their deps through the router
 * context (`future.v8_middleware`). A person kept out is a PAGE (`/app/no-access`, which says why and who to ask), so the middleware
 * lets that one path through and sends everyone else on to it. The page's own permission is checked by that page's loader.
 */
export const middleware = [firesio.adminMiddleware];

/**
 * This layout hides what a member cannot use, but only to be kind. On the kept-out page there is no member (`maybeFrom` answers
 * `member: null`, where `from` would redirect to that very page): that is "no permissions", not an error.
 */
export const loader = ({ context }: LoaderFunctionArgs) => {
  const { member, services } = firesio.maybeFrom(context);
  return { apiKey: services.env.SHOPIFY_API_KEY, permissions: member === null ? [] : [...grantsOf(member, MEMBERS)] };
};

/**
 * This shell's data is fixed for the lifetime of the embedded session, so client-side navigation between /app pages does not
 * re-run it. Safe for auth: the middleware runs on every request to /app, and every page loader and action checks its own permission.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({ formMethod, defaultShouldRevalidate }) => (formMethod ? defaultShouldRevalidate : false);

export default function AppLayout() {
  const { apiKey, permissions } = useLoaderData<typeof loader>();
  return (
    <EmbeddedProvider apiKey={apiKey}>
      <AppNav permissions={permissions} />
      <Outlet />
    </EmbeddedProvider>
  );
}

/**
 * Shopify needs React Router to catch some thrown responses so their headers reach the response. The one that matters on
 * screen is the App Bridge "bounce" page (a session token on its way): rendered from `thrownResponseHtml`, because Shopify's
 * own `boundary.error` compares a class name a minified bundle renames, and the merchant saw "Something went wrong".
 * A 403 from the guard (a blocked shop, a page the member may not open) is explained, not shown as a failure.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const html = thrownResponseHtml(error);
  if (html !== null) return <div dangerouslySetInnerHTML={{ __html: html }} />;
  if (isRouteErrorResponse(error) && error.status === 403) {
    const blocked = typeof error.data === "object" && error.data !== null && "reason" in error.data && error.data.reason === "blocked";
    return (
      <s-page heading={blocked ? "This account is unavailable" : "You cannot open this page"}>
        <s-section>
          <s-paragraph>{blocked ? "Access to the app was turned off for this store. Contact support if you think this is a mistake." : "Ask someone who manages the team to give you access."}</s-paragraph>
        </s-section>
      </s-page>
    );
  }
  throw error;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
