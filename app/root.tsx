import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useRouteError } from "react-router";
import type { LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { failureOf } from "~/components/failure";
import { thrownResponseHtml } from "~/components/thrown-response";
import { directionOf, localeOf } from "~/i18n/language";
import "@shopify/app-bridge-types";

/**
 * The root loader resolves the language once per request; `<html lang dir>`, the server render and the client hydration read it
 * from here and can never disagree.
 */
export const loader = ({ request }: LoaderFunctionArgs) => ({ locale: localeOf(request) });

/** The document's language is chosen when the document loads and does not change while the app is open: in-app navigation must not re-run this loader (it can drop `?locale=`). */
export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export default function App() {
  const { locale } = useLoaderData<typeof loader>();
  return (
    // App Bridge adds a class to <html> (`p-partial-theme-admin-next`) before React hydrates, which would be a hydration mismatch.
    <html lang={locale} dir={directionOf(locale)} suppressHydrationWarning>
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
 * The last resort for anything no route boundary took: an unknown address (404), a thrown response, a crash. Plain HTML on
 * purpose, with no Polaris, no stylesheet and no script of ours (the document is the whole page, and the public CSP forbids
 * inline styles): it must render even when the thing that failed is the app's own UI. Production says the status and one line;
 * the detail appears in a development server only (`MODE` is "development"; a production build and the tests say less).
 *
 * A middleware that throws (the /app guard) is handed to the boundary of the shallowest route that has a loader, and this root
 * has one: so a thrown SUCCESS response (App Bridge's session-token page, `thrownResponseHtml`) and a blocked shop's 403 land
 * here, not in the /app layout's boundary.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const bounce = thrownResponseHtml(error);
  const failure = failureOf(error, import.meta.env.MODE === "development");
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{bounce === null ? `${failure.status} ${failure.title}` : "Loading"}</title>
      </head>
      <body>
        {bounce === null ? (
          <main>
            <h1>{failure.status}</h1>
            <p>{failure.title}</p>
            {failure.message === null ? null : <p>{failure.message}</p>}
            {failure.detail === null ? null : <pre>{failure.detail}</pre>}
            <p><a href="/">Back to the start</a></p>
          </main>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: bounce }} />
        )}
      </body>
    </html>
  );
}
