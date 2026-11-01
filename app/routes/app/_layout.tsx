import type { HeadersFunction, LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { Outlet, isRouteErrorResponse, useLoaderData, useRouteError, useRouteLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";

import { accessRefusalOf, guardMember } from "~/admin/require-member.server";
import { EmbeddedProvider } from "~/components/admin/EmbeddedProvider";
import { NoAccess } from "~/components/admin/NoAccess";
import { permissionsOf } from "~/domain/member-access";
import { isAccessRefusal } from "~/domain/member-admission";
import { UTC } from "~/i18n/time-zone";
import { contactsToAsk } from "~/services/members.server";
import { memberDependencies } from "~/wiring.server";
import { useNavigationLoading } from "~/admin/use-navigation-loading";
import { getEnv } from "~/request-context.server";
import { persistShopIdentity, shopTimeZone } from "~/wiring.server";
import { TimeZoneProvider } from "~/i18n/useTimeZone";
import { thrownResponseHtml } from "~/lib/thrown-response";

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
    // Independent of each other: the identity write-through and the stored zone.
    const [, timeZone] = await Promise.all([
      persistShopIdentity(admin, session.shop),
      shopTimeZone(admin, session.shop),
    ]);

    // The LANGUAGE needs no handling here: Shopify puts its `locale` parameter on the request that LOADS the embedded
    // app, and the root loader reads it once, for the document (`root.tsx` never revalidates, so a later in-app
    // navigation that drops the parameter cannot change `<html lang>`). A form that must store the merchant's language
    // posts it with the form (`useLanguage()`, parsed on the server with `languageCodeOf`), because an in-app request
    // may not carry `?locale=`. Do NOT add a language switcher to this surface: the app would then be able to disagree
    // with the admin around it.
    return { apiKey, timeZone, access: { granted: true as const, permissions: permissionsOf(member.role) } };
  } catch (thrown) {
    // Not being let in is a page, not an error: the person is signed in to Shopify and deserves to be told why. It is
    // returned from here (not thrown to the boundary) because this loader is the only place the API key is at hand
    // for the page that explains it. Anything else the guard threw (the library's bounce, a 401) propagates untouched.
    const refusal = accessRefusalOf(thrown);
    if (refusal === undefined) throw thrown;
    // Who to ask is read here, once, for this screen only: no ordinary page pays for it.
    const contacts = await contactsToAsk(refusal.shop, memberDependencies());
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
  const { t } = useTranslation("admin");
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
      <s-app-nav>
        <s-link href="/app" rel="home">{t("nav.home")}</s-link>
        {/* A link the person cannot open is not offered. The page checks the permission itself. */}
        {access.permissions.some((permission) => permission === "billing:manage") ? <s-link href="/app/billing">{t("nav.billing")}</s-link> : null}
        {access.permissions.some((permission) => permission === "members:manage") ? <s-link href="/app/members">{t("nav.members")}</s-link> : null}
        <s-link href="/app/support">{t("nav.support")}</s-link>
      </s-app-nav>
      <TimeZoneProvider value={timeZone}>
        <Outlet />
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
  const layout = useRouteLoaderData<typeof loader>(LAYOUT_ROUTE_ID);
  const html = thrownResponseHtml(error);
  if (html !== null) return <div dangerouslySetInnerHTML={{ __html: html }} />;
  const reason = isRouteErrorResponse(error) && error.status === 403 && typeof error.data === "object" && error.data !== null && "reason" in error.data ? error.data.reason : undefined;
  if (isAccessRefusal(reason)) {
    return (
      <EmbeddedProvider apiKey={layout?.apiKey ?? ""}>
        <NoAccess reason={reason} />
      </EmbeddedProvider>
    );
  }
  throw error;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
