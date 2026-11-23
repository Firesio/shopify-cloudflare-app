import type { HeadersFunction, LinksFunction, LoaderFunctionArgs } from "react-router";
import { data, Link, Outlet, useLoaderData } from "react-router";
import { installTarget } from "@firesio/app/shell";
import { LanguageSwitcher, useLanguagePath } from "@firesio/app/ui/language";
import { identity } from "~/core/identity";
import { supportMailDomain } from "@firesio/app/support";
import { firesio } from "~/firesio.server";
import { publicNavLabelsOf } from "~/i18n/labels";
// The public stylesheet is loaded HERE, by this layout's links(), so it ships only while a public route is matched. It must
// never reach the embedded admin, whose Polaris web components bring their own styling.
import publicStyles from "~/styles/public/public.scss?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: publicStyles }];

/**
 * Decides, once for every public page: its language (read from the ADDRESS, `/es/support` is Spanish; the home address alone opens in the visitor's language;
 * a folder that is no language is a 404: `firesio.publicLanguage`), how a visitor installs the app (the listing when `SHOPIFY_APP_HANDLE` is set, the
 * shop-domain form when it is not), and the one contact address, derived from this app's own domain so shared code never names an app.
 */
export const loader = (args: LoaderFunctionArgs) => {
  const page = firesio.publicLanguage(args);
  const { env, i18n } = firesio.services();
  const domain = supportMailDomain(env.SHOPIFY_APP_URL, env.MAIL_DOMAIN);
  const value = { ...page, labels: publicNavLabelsOf(i18n.translator(page.language)), install: installTarget(env.SHOPIFY_APP_HANDLE), supportEmail: domain === null ? identity.contacts.supportEmail : `support@${domain}` };
  return data(value, { headers: firesio.publicLanguageHeaders(page) });
};

export const headers: HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export default function PublicLayout() {
  const page = useLoaderData<typeof loader>();
  const { supportEmail, labels } = page;
  const to = useLanguagePath();
  return (
    <div className="shell">
      <a className="skip-link" href="#main">{labels.skip}</a>
      <header className="header">
        <div className="header__inner">
          <Link to={to("/")} className="header__brand">{identity.name}</Link>
          <nav className="header__nav" aria-label={labels.main}>
            <Link to={to("/support")}>{labels.support}</Link>
            <Link to={to("/legal/privacy")}>{labels.privacy}</Link>
            <Link to={to("/legal/terms")}>{labels.terms}</Link>
          </nav>
          <LanguageSwitcher page={page} label={labels.language} className="header__language" />
        </div>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="footer__inner">
          <p>© {identity.name}</p>
          <p><a href={`mailto:${supportEmail}`}>{supportEmail}</a></p>
        </div>
      </footer>
    </div>
  );
}
