import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { directionOf, localeOf } from "@firesio/app";
import { RootErrorBoundary } from "@firesio/app/ui/shell";
import "@shopify/app-bridge-types";

/**
 * The root loader resolves the language once per request; `<html lang dir>`, the server render and the client hydration read it
 * from here and can never disagree.
 */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const locale = localeOf(request);
  return { locale, dir: directionOf(locale) };
};

/** The document's language is chosen when the document loads and does not change while the app is open: in-app navigation must not re-run this loader (it can drop `?locale=`). */
export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export default function App() {
  const { locale, dir } = useLoaderData<typeof loader>();
  return (
    // App Bridge adds a class to <html> (`p-partial-theme-admin-next`) before React hydrates, which would be a hydration mismatch.
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * The last resort for anything no route boundary took: an unknown address (404), a thrown response, a crash. The library's
 * `RootErrorBoundary` is the whole document in plain HTML (no Polaris, no script of ours, status and one line). The detail (message
 * and stack) appears in a development server only: `MODE` is "development" there, while `import.meta.env.DEV` is also true under
 * vitest, where the tests hold the page to saying no more than a production build does.
 *
 * A middleware that throws (the /app guard) is handed to the boundary of the shallowest route that has a loader, and this root
 * has one: so a blocked shop's 403 and a thrown SUCCESS response (App Bridge's session-token page) land here, not in the /app
 * layout's boundary. `RootErrorBoundary` words the 403 and renders the session-token page as the document it carries (it is not an
 * error, and without it the merchant never gets past the token exchange).
 */
export function ErrorBoundary() {
  return <RootErrorBoundary showDetails={import.meta.env.MODE === "development"} />;
}
