import { layout, route, type RouteConfigEntry } from "@react-router/dev/routes";

/**
 * The staff phone app's routes, mounted by `app/routes.ts` only while `PWA` is on (`app/core/features.ts`). Public: the install guide and the
 * pairing screen under one pathless layout, and beside it the resource routes (the manifest, the two pairing calls, the service worker): no session,
 * because an unpaired phone has none and a browser fetches a manifest without cookies. Under `/app`: the member's own page about their phones.
 * Kept here, with no import but the route helpers, because `routes.ts` runs in Node before the app's aliases exist.
 */
export const phonePublicRoutes: RouteConfigEntry[] = [
  layout("routes/m/layout.tsx", [route("m", "routes/m/index.tsx"), route("m/start", "routes/m/start.tsx")]),
  route("m/manifest.webmanifest", "routes/m/manifest.ts"),
  route("m/api/link/start", "routes/m/link-start.ts"),
  route("m/api/link/poll", "routes/m/link-poll.ts"),
  route("sw.js", "routes/sw.ts"),
];

/** Under the `/app` layout (the guard has run and the preset has set the devices context). */
export const phoneAppRoutes: RouteConfigEntry[] = [route("phone", "routes/app/phone.tsx")];

/** The route files above, for the test that holds the switch (`app/features.test.ts`): what turning the part on must mount, and what turning it off must not. */
export const PHONE_ROUTE_FILES: readonly string[] = [...phonePublicRoutes, ...phoneAppRoutes].flatMap((entry) => [entry.file, ...(entry.children ?? []).map((child) => child.file)]);
