import type { LinksFunction } from "react-router";
import { Link, Outlet, useLoaderData } from "react-router";
import { installTarget } from "~/core/install-target";
import { identity } from "~/core/identity";
import { services } from "~/wiring/services";
import { supportMailDomain } from "@firesio/support";
// The public stylesheet is loaded HERE, by this layout's links(), so it ships only while a public route is matched. It must
// never reach the embedded admin, whose Polaris web components bring their own styling.
import publicStyles from "~/styles/public/public.scss?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: publicStyles }];

/**
 * Decides, once for every public page, how a visitor installs the app (the listing when `SHOPIFY_APP_HANDLE` is set, the
 * shop-domain form when it is not), and the one contact address, derived from this app's own domain so shared code never names an app.
 */
export const loader = () => {
  const { env } = services();
  const domain = supportMailDomain(env.SHOPIFY_APP_URL, env.SUPPORT_MAIL_DOMAIN);
  return { install: installTarget(env.SHOPIFY_APP_HANDLE), supportEmail: domain === null ? identity.contacts.supportEmail : `support@${domain}` };
};

/** The answer is deploy configuration: nothing to refetch between page navigations. */
export const shouldRevalidate = () => false;

export default function PublicLayout() {
  const { supportEmail } = useLoaderData<typeof loader>();
  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="header">
        <div className="header__inner">
          <Link to="/" className="header__brand">{identity.name}</Link>
          <nav className="header__nav" aria-label="Main">
            <Link to="/support">Support</Link>
            <Link to="/legal/privacy">Privacy</Link>
            <Link to="/legal/terms">Terms</Link>
          </nav>
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
