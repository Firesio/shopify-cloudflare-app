import type { MiddlewareFunction, ServerBuild } from "react-router";
import * as entryModule from "~/entry.server";
import * as root from "~/root";
import * as appHome from "~/routes/app/home";
import * as appLayout from "~/routes/app/layout";
import * as supportUpload from "~/routes/app/support/upload";
import * as callback from "~/routes/auth/callback";
import * as unsubscribe from "~/routes/campaigns/unsubscribe";
import * as landing from "~/routes/public/landing";
import * as support from "~/routes/public/support";
import * as healthz from "~/routes/healthz";
import * as receive from "~/routes/webhooks/receive";

/** The resource routes (an action, a loader): the build type wants a component, which a resource route never renders. */
const noComponent = () => null;

/**
 * A route's `middleware` array as the server build types it. A middleware the app writes (the /app layout's with the preset's `adminMiddleware`, the support page's) is typed `MiddlewareFunction<unknown>`,
 * which the build's `MiddlewareFunction<Response>` does not accept; each function is called as it is and only its result is
 * narrowed (a `Response`, or nothing: what the router reads from a middleware).
 */
const asResponseMiddleware = (middleware: readonly MiddlewareFunction[] | undefined): MiddlewareFunction<Response>[] | undefined =>
  middleware?.map((fn) => async (args, next) => {
    const result = await fn(args, next);
    return result instanceof Response ? result : undefined;
  });

type ServerRoute = NonNullable<ServerBuild["routes"][string]>;
type ManifestRoute = ServerBuild["assets"]["routes"][string];
type Spec = { readonly id: string; readonly parentId?: string; readonly path?: string; readonly index?: true; readonly module: ServerRoute["module"] };

/** One route twice: the server's route (its module) and the manifest entry the document renderer reads (what the module exports). */
function define(spec: Spec): { readonly route: ServerRoute; readonly manifest: NonNullable<ManifestRoute> } {
  const { module } = spec;
  const place = { id: spec.id, ...(spec.parentId === undefined ? {} : { parentId: spec.parentId }), ...(spec.path === undefined ? {} : { path: spec.path }), ...(spec.index === undefined ? {} : { index: spec.index }) };
  return {
    route: { ...place, module },
    manifest: {
      ...place,
      module: `/assets/${spec.id}.js`,
      imports: [],
      hasAction: "action" in module,
      hasLoader: "loader" in module,
      hasClientAction: false,
      hasClientLoader: false,
      hasClientMiddleware: false,
      hasErrorBoundary: "ErrorBoundary" in module,
      clientActionModule: undefined,
      clientLoaderModule: undefined,
      clientMiddlewareModule: undefined,
      hydrateFallbackModule: undefined,
    },
  };
}

/**
 * What `virtual:react-router/server-build` is in the end-to-end tests (`vitest.config.ts` aliases it here), so the REAL
 * `workers/app.ts` boots under workerd without the React Router Vite plugin. The routes are the app's own route modules, the
 * entry is its own `entry.server.tsx`; only the route table is narrowed to the routes the tests call (the webhook receiver,
 * `/healthz`, the campaign unsubscribe page, the landing and support pages, `/auth/*`, `/app` and the support file staging route under it), with the ids, parents and paths `app/routes.ts` gives them (the
 * public layout excepted: it imports a stylesheet, so those pages are mounted on the root).
 */
const defined = [
  define({ id: "root", path: "", module: root }),
  define({ id: "routes/webhooks/receive", parentId: "root", path: "webhooks/*", module: { ...receive, default: noComponent } }),
  define({ id: "routes/app/layout", parentId: "root", path: "app", module: { ...appLayout, middleware: asResponseMiddleware(appLayout.middleware) } }),
  define({ id: "routes/app/home", parentId: "routes/app/layout", index: true, module: appHome }),
  define({ id: "routes/app/support/upload", parentId: "routes/app/layout", path: "support/upload", module: { ...supportUpload, default: noComponent } }),
  define({ id: "routes/auth/callback", parentId: "root", path: "auth/*", module: { ...callback, default: noComponent } }),
  define({ id: "routes/public/landing", parentId: "root", index: true, module: landing }),
  define({ id: "routes/public/support", parentId: "root", path: "support", module: { ...support, middleware: asResponseMiddleware(support.middleware) } }),
  define({ id: "routes/campaigns/unsubscribe", parentId: "root", path: "campaigns/unsubscribe", module: { ...unsubscribe, default: noComponent } }),
  define({ id: "routes/healthz", parentId: "root", path: "healthz", module: { ...healthz, default: noComponent } }),
];

export const entry: ServerBuild["entry"] = { module: entryModule };
export const routes: ServerBuild["routes"] = Object.fromEntries(defined.map(({ route }) => [route.id, route]));
export const assets: ServerBuild["assets"] = {
  url: "/assets/manifest.js",
  version: "test",
  entry: { imports: [], module: "/assets/entry.client.js" },
  routes: Object.fromEntries(defined.map(({ manifest }) => [manifest.id, manifest])),
};
export const basename: ServerBuild["basename"] = "/";
export const publicPath: ServerBuild["publicPath"] = "/";
export const assetsBuildDirectory: ServerBuild["assetsBuildDirectory"] = "build/client";
export const future: ServerBuild["future"] = { v8_middleware: true, v8_passThroughRequests: true, v8_trailingSlashAwareDataRequests: true };
export const ssr: ServerBuild["ssr"] = true;
export const isSpaMode: ServerBuild["isSpaMode"] = false;
export const prerender: ServerBuild["prerender"] = [];
export const routeDiscovery: ServerBuild["routeDiscovery"] = { mode: "initial", manifestPath: "/__manifest" };
