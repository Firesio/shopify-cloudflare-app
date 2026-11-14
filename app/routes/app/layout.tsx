import { boundary } from "@shopify/shopify-app-react-router/server";
import { grantsOf } from "@firesio/members";
import type { HeadersFunction, LoaderFunctionArgs, MiddlewareFunction, ShouldRevalidateFunction } from "react-router";
import { isRouteErrorResponse, Outlet, useLoaderData, useRouteError } from "react-router";
import { AppNav } from "~/components/AppNav";
import { EmbeddedProvider } from "~/components/EmbeddedProvider";
import { MEMBERS } from "~/core/members";
import { thrownResponseHtml } from "~/components/thrown-response";
import { admit } from "~/wiring/guard";
import { provideAppUi } from "~/wiring/app-ui";
import { services } from "~/wiring/services";

/** Hands the page modules of `@firesio/app-ui` their deps through the router context (`future.v8_middleware`). */
export const middleware: MiddlewareFunction[] = [
  ({ context }, next) => {
    provideAppUi(context);
    return next();
  },
];

/**
 * Shopify proves who is asking and the members library decides whether that person may be here. A person kept out is a PAGE
 * (`/app/no-access`, which says why and who to ask), so this loader lets that one path through and sends everyone else on
 * to the guard of their own page. The page's own permission is checked by that page's loader: this layout hides what a member
 * cannot use, but only to be kind.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { access } = await admit(request);
  const permissions = access.ok ? grantsOf(access.member, MEMBERS) : [];
  return { apiKey: services().env.SHOPIFY_API_KEY, permissions: [...permissions] };
};

/**
 * This shell's data is fixed for the lifetime of the embedded session, so client-side navigation between /app pages does not
 * re-run it. Safe for auth: every page loader and action runs `guardMember` itself.
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
