import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { installTarget } from "~/core/install-target";
import { identity } from "~/core/identity";
import { services } from "~/wiring/services";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // Shopify sends merchants here with ?shop=... when they open the app from the admin: straight to the embedded app.
  if (url.searchParams.get("shop")) throw redirect(`/app?${url.searchParams.toString()}`);
  return { install: installTarget(services().env.SHOPIFY_APP_HANDLE) };
};

export const meta: MetaFunction = () => [{ title: identity.name }, { name: "description", content: "TODO: one sentence about what the app does." }];

/**
 * Two ways in. Listed on the App Store: one link out to the listing, no field for a shop domain (Shopify forbids asking for it).
 * Not listed yet: the shop-domain form that starts OAuth directly. Placeholder copy: a derived app writes its own.
 */
export default function Landing() {
  const { install } = useLoaderData<typeof loader>();
  return (
    <section className="section">
      <div className="container stack--lg center">
        <p className="eyebrow">TODO: category</p>
        <h1>TODO: what your app does, in one line</h1>
        <p className="lead">TODO: the follow-up sentence: who it is for and why it matters.</p>
        {install.kind === "appStore" ? (
          <a href={install.url} className="btn btn--primary" rel="noopener">Install from the Shopify App Store</a>
        ) : (
          <form action="/auth/login" method="get" className="stack form--narrow">
            <div className="field">
              <label className="field__label" htmlFor="shop">Enter your Shopify store URL</label>
              <input className="field__input" id="shop" name="shop" type="text" required placeholder="your-store.myshopify.com" autoComplete="url" inputMode="url" />
            </div>
            <button type="submit" className="btn btn--primary">Install on Shopify</button>
          </form>
        )}
      </div>
    </section>
  );
}
