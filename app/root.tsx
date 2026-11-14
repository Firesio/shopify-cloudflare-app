import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
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
    <html lang={locale} dir={directionOf(locale)}>
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
