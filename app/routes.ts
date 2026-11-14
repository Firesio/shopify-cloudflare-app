import { index, layout, prefix, route, type RouteConfig } from "@react-router/dev/routes";

/**
 * Explicit route config, NOT flat file-name routing: the URL structure lives here and the file tree mirrors it.
 * One surface per top-level group. The merchant pages of `@firesio/app-ui` are two-line files under `routes/app/`
 * that re-export a library route module.
 */
export default [
  // Public surface: marketing, legal, support. No authentication (the App Store listing links straight to /legal/privacy).
  layout("routes/public/layout.tsx", [
    index("routes/public/landing.tsx"),
    route("support", "routes/public/support.tsx"),
    ...prefix("legal", [route("privacy", "routes/public/legal/privacy.tsx"), route("terms", "routes/public/legal/terms.tsx")]),
  ]),

  // Embedded Shopify admin: everything under /app runs inside the Shopify admin iframe.
  route("app", "routes/app/layout.tsx", [
    index("routes/app/home.tsx"),
    route("support", "routes/app/support/list.tsx"),
    route("support/new", "routes/app/support/new.tsx"),
    route("support/:ticketId", "routes/app/support/thread.tsx"),
    route("members", "routes/app/members/team.tsx"),
    route("members/:memberId", "routes/app/members/member.tsx"),
    route("no-access", "routes/app/members/no-access.tsx"),
    route("plans", "routes/app/plans.tsx"),
  ]),

  // OAuth: paths fixed by `authPathPrefix: "/auth"` and the redirect_urls in shopify.app*.toml. Do not rename.
  ...prefix("auth", [route("login", "routes/auth/login.tsx"), route("*", "routes/auth/callback.tsx")]),

  // Webhooks: URIs must match the subscriptions in BOTH shopify.app.toml files. One receiver for every topic.
  route("webhooks/*", "routes/webhooks/receive.ts"),

  route("healthz", "routes/healthz.ts"),
] satisfies RouteConfig;
