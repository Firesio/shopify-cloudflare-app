import type { HeadersFunction, LinksFunction, LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { Outlet, useLoaderData, useLocation, useRouteError, useRouteLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AccessProvider } from "~/admin/access";
import { layoutErrorView } from "~/admin/route-error";
import { accessRefusalOf, guardMember } from "~/admin/require-member.server";
import { boundAdmin, loadShellDecoration } from "~/admin/shell-data.server";
import { useNavigationLoading } from "~/admin/use-navigation-loading";
import { AppNav } from "~/components/admin/AppNav";
import { EmbeddedProvider } from "~/components/admin/EmbeddedProvider";
import { MemberMissing } from "~/components/admin/MemberMissing";
import { NoAccess } from "~/components/admin/NoAccess";
import { grantsOf } from "~/domain/member-access";
import { TimeZoneProvider } from "~/i18n/useTimeZone";
import { UTC } from "~/i18n/time-zone";
import { shopLog } from "~/observability/shop-log";
import { getEnv } from "~/request-context.server";
import { contactsToAsk } from "~/services/members.server";
import skeletonStyles from "~/styles/admin/skeleton.css?url";
import { memberDependencies, persistShopIdentity, shopTimeZone } from "~/wiring.server";

// The one stylesheet the embedded admin carries (OWNER DECISION, .claude/rules/styling.md): it only animates the
// `data-skeleton` marker that `components/admin/Skeleton.tsx` sets. Loaded HERE, by this layout's links(), so it never
// reaches the public pages or the staff console, and never from root.tsx.
export const links: LinksFunction = () => [{ rel: "stylesheet", href: skeletonStyles }];

/**
 * Namespaces for the embedded admin. `public` is deliberately absent — the
 * marketing and legal copy must not ship inside the admin bundle.
 */
export const handle = { i18n: ["common", "admin"] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const env = getEnv();
  // The public client_id, read from the Worker's env binding: there is no process.env in workerd.
  const apiKey = env.SHOPIFY_API_KEY || "";
  try {
    // Shopify proves who is asking; the guard says whether that person may be here at all. Everything below it is for a
    // member only, so a person who is kept out costs no write and no Admin API call.
    const { admin, session, member } = await guardMember(request, "app:view");
    // Independent of each other, and both only DECORATE the shell: bounded, and a failure costs the zone (UTC), never the
    // page. Authentication above is what stays awaited without a fallback.
    const { timeZone } = await loadShellDecoration(session.shop, {
      persistIdentity: (signal) => persistShopIdentity(boundAdmin(admin, signal), session.shop),
      timeZone: (signal) => shopTimeZone(boundAdmin(admin, signal), session.shop),
      log: shopLog,
    });

    // The LANGUAGE needs no handling here: Shopify puts its `locale` parameter on the request that LOADS the embedded
    // app, and the root loader reads it once, for the document (`root.tsx` never revalidates, so a later in-app
    // navigation that drops the parameter cannot change `<html lang>`). A form that must store the merchant's language
    // posts it with the form (`useLanguage()`, parsed on the server with `languageCodeOf`), because an in-app request
    // may not carry `?locale=`. Do NOT add a language switcher to this surface: the app would then be able to disagree
    // with the admin around it.
    return { apiKey, timeZone, access: { granted: true as const, permissions: grantsOf(member) } };
  } catch (thrown) {
    // Not being let in is a page, not an error: the person is signed in to Shopify and deserves to be told why. It is
    // returned from here (not thrown to the boundary) because this loader is the only place the API key is at hand
    // for the page that explains it. Anything else the guard threw (the library's bounce, a 401) propagates untouched.
    const refusal = accessRefusalOf(thrown);
    if (refusal === undefined) throw thrown;
    // Who to ask: the refusal already carries them when it came from the guard; read here only for a refusal that did
    // not. Once, for this screen only: no ordinary page pays for it.
    const contacts = refusal.contacts ?? (await contactsToAsk(refusal.shop, memberDependencies()));
    return { apiKey, timeZone: UTC, access: { granted: false as const, reason: refusal.reason, contacts } };
  }
};

/**
 * This shell's data (the public API key and the shop's zone) is fixed for the
 * lifetime of the embedded session, so client-side navigations between /app
 * pages must not re-run it: every click would otherwise repeat the session-token
 * check and the D1 reads before the page's own loader even starts.
 *
 * Safe for auth because every child loader and action calls `guardMember`
 * itself (Shopify requires a valid session token on each request, a failure
 * still throws the library's 401 / App Bridge bounce response from that child, and
 * the page's own permission is checked there, not here).
 * After an action the default applies, so the shell refreshes alongside the
 * data the action changed.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({ formMethod, defaultShouldRevalidate }) =>
  formMethod ? defaultShouldRevalidate : false;

export default function App() {
  const { apiKey, timeZone, access } = useLoaderData<typeof loader>();
  useNavigationLoading();

  if (!access.granted) {
    return (
      <EmbeddedProvider apiKey={apiKey}>
        <NoAccess reason={access.reason} contacts={access.contacts} />
      </EmbeddedProvider>
    );
  }

  return (
    <EmbeddedProvider apiKey={apiKey}>
      <AppNav permissions={access.permissions} />
      <TimeZoneProvider value={timeZone}>
        <AccessProvider permissions={access.permissions}>
          <Outlet />
        </AccessProvider>
      </TimeZoneProvider>
    </EmbeddedProvider>
  );
}

// Shopify needs React Router to catch some thrown responses so their headers
// make it into the response. The one that matters on screen is the App Bridge
// "bounce" page; see `thrownResponseHtml` for why `boundary.error` cannot be
// used to render it from a minified bundle.
//
// The other thing caught here is a page the person may not open (the member guard's 403): it is explained, not
// rendered as a failure. The API key comes from this route's own loader data, which survives a child's error.
const LAYOUT_ROUTE_ID = "routes/app/_layout";

export function ErrorBoundary() {
  const error = useRouteError();
  const { pathname } = useLocation();
  const layout = useRouteLoaderData<typeof loader>(LAYOUT_ROUTE_ID);
  const view = layoutErrorView(error, pathname);
  // What the person can still use: the menu, when the layout's own loader let them in (a refusal from a CHILD page; the
  // layout's loader keeps its own page for a person who is not let in at all).
  const permissions = layout?.access.granted ? layout.access.permissions : undefined;
  const apiKey = layout?.apiKey ?? "";

  switch (view.kind) {
    case "bounce":
      return <div dangerouslySetInnerHTML={{ __html: view.html }} />;
    case "refusal":
      return (
        <EmbeddedProvider apiKey={apiKey}>
          {permissions ? <AppNav permissions={permissions} /> : null}
          <NoAccess reason={view.reason} contacts={view.contacts} homeHref={permissions ? "/app" : undefined} />
        </EmbeddedProvider>
      );
    case "member_missing":
      return (
        <EmbeddedProvider apiKey={apiKey}>
          {permissions ? <AppNav permissions={permissions} /> : null}
          <MemberMissing />
        </EmbeddedProvider>
      );
    case "rethrow":
      throw error;
  }
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
