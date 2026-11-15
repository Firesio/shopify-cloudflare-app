import type { ServerBuild } from "react-router";
import * as entryModule from "~/entry.server";
import * as root from "~/root";
import * as healthz from "~/routes/healthz";
import * as receive from "~/routes/webhooks/receive";

/** The two routes are resource routes (an action, a loader): the build type wants a component, which a resource route never renders. */
const noComponent = () => null;

/**
 * What `virtual:react-router/server-build` is in the end-to-end tests (`vitest.config.ts` aliases it here), so the REAL
 * `workers/app.ts` boots under workerd without the React Router Vite plugin. The routes are the app's own route modules, the
 * entry is its own `entry.server.tsx`; only the manifest is narrowed to the two routes the tests call (`/healthz` and the
 * webhook receiver), with the ids, parents and paths `app/routes.ts` gives them.
 */
export const entry: ServerBuild["entry"] = { module: entryModule };
export const routes: ServerBuild["routes"] = {
  root: { id: "root", path: "", module: root },
  "routes/webhooks/receive": { id: "routes/webhooks/receive", parentId: "root", path: "webhooks/*", module: { ...receive, default: noComponent } },
  "routes/healthz": { id: "routes/healthz", parentId: "root", path: "healthz", module: { ...healthz, default: noComponent } },
};
export const assets: ServerBuild["assets"] = { url: "/assets/manifest.js", version: "test", entry: { imports: [], module: "/assets/entry.client.js" }, routes: {} };
export const basename: ServerBuild["basename"] = "/";
export const publicPath: ServerBuild["publicPath"] = "/";
export const assetsBuildDirectory: ServerBuild["assetsBuildDirectory"] = "build/client";
export const future: ServerBuild["future"] = { v8_middleware: true, v8_passThroughRequests: true, v8_trailingSlashAwareDataRequests: true };
export const ssr: ServerBuild["ssr"] = true;
export const isSpaMode: ServerBuild["isSpaMode"] = false;
export const prerender: ServerBuild["prerender"] = [];
export const routeDiscovery: ServerBuild["routeDiscovery"] = { mode: "initial", manifestPath: "/__manifest" };
