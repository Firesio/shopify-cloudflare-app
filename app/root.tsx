import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getLanguage } from "~/i18n/i18n.server";
import { directionOf } from "~/i18n/config";
import "@shopify/app-bridge-types";

/**
 * The root loader resolves the language once per request. Everything below reads
 * it from here rather than re-detecting, so `<html lang>`, the server render and
 * the client hydration can never disagree.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return { language: await getLanguage(request) };
};

export default function App() {
  // Root reads its own loader data. Everything BELOW root uses useLanguage() from
  // ~/i18n/useLanguage instead — it reads the language from i18next, so it needs no
  // route id and cannot disagree with the strings being rendered.
  const { language } = useLoaderData<typeof loader>();

  return (
    // `lang` is what assistive tech and the browser's own translation prompt
    // read, and what entry.client reads back to initialise i18next. `dir` comes
    // from the generated language table (Intl), so adding an RTL language is adding a folder.
    <html lang={language} dir={directionOf(language)}>
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
