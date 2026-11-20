# The POS webview and the staff phone app (opt-in)

`@firesio/app` 1.0.0 can serve the app's `/app` pages inside the **Shopify POS app** and on a **staff member's phone** (an installed web app), with the SAME pages: a page declares what its actions are and each surface draws them. The POS side is wired in the template and costs nothing on the web admin (section 2); the phone app is a switch, off (section 3). Design: the platform repo, `docs/architecture.md` section 6.12 and `docs/tickets/21-surface-devices.md`; the package's own words: `@firesio/app/surface`, `ui/surface`, `devices`, `ui/devices` (each has a README).

## 1. A page's actions (wired: do this in every page you add)

A page draws its actions with `PageActions` from `@firesio/app/ui/surface` as the LAST child of `s-page`, never with `slot="primary-action"` / `slot="secondary-actions"` written by hand. The home page does it (`app/components/HomeView.tsx`):

```tsx
<s-page heading="Orders">
  {/* content */}
  <PageActions>
    <PageAction onClick={archive}>View archived</PageAction>
    <PageAction requires="scanner" onClick={scan}>Scan</PageAction>        {/* only where the host has a scanner */}
    <PageAction on="pos" onClick={payAtRegister}>Pay at register</PageAction> {/* only inside POS */}
    <PagePrimaryAction href="/app/orders/new">New order</PagePrimaryAction>
  </PageActions>
</s-page>
```

In the web admin this is the header slots, exactly as before. Name a capability (`requires`: `scanner`, `share`, `picker`, `resourcePicker`, `register`) when a control needs a facility the host may lack; name a surface (`on`, `OnSurface`) only for work that really belongs to one. **Held by tests**: `app/surface.test.ts` runs `pageActionsFindings` over `app/routes/app/**` and `app/components/` (a hand-written slot, `PageActions` not last, a misplaced primary all fail `verify` with the file and line), and `app/dom/HomeView.dom.test.tsx` draws the page on every surface with `pageOnEverySurface` (give a new page its own `*.dom.test.tsx` the same way; the page must be a component that takes its data as props, so a test can draw it without a router).

## 2. The Shopify POS webview (wired; one line is yours)

Already in the template: `surface: {}` in `app/firesio.server.ts`; the report route `app/routes/app/surface.ts` and its line in `app/routes.ts` (held by `reportRouteFindings`); the `/app` layout's loader returns `surface` and wraps its outlet in `<AppSurface surface back={backOf(pathname)}>` (nothing is drawn on the web admin: no element, no style, no request; only inside POS it adds the bar's stylesheet, the bar and a spacer); `app/core/back.ts`, the parent of each page for the POS Back button (**edit it when you add a section**).

What is left to the app: `[pos] embedded = true` in `shopify.app.toml` (a commented line there: it lists the app in the POS app, so it is a decision), and what each surface SHOWS (dashboard regions, printing, the detail page): the app's own table over `Surface`; the package does not decide it. Words: `AppSurface` takes `labels={surfaceLabelsFor(locale)}` when the app is translated.

## 3. Serve the staff phone app

Needs a Workers Rate Limiting binding `DEVICE_LINK_LIMITER` (top level AND `env.production`), a migration for the three tables of `@firesio/app/devices/d1` (add `node_modules/@firesio/app/src/devices/d1/schema.ts` to `drizzle.config.ts`, `npm run db:generate`, check the SQL), and in `createFiresio`:

```ts
devices: { denied: [{ prefix: "settings/billing", why: "the plan and billing" }, { prefix: "settings/team", why: "team management" }], manifest: { /* name, colours, icons */ } },
```

`denied` is REQUIRED (an explicit `[]` is a decision): the phone is the web admin minus the pages listed, so a page added later works on the phone with no edit. List what a lost or borrowed phone must not be able to do. Then mount, one line each: the public pages (`@firesio/app/ui/devices/install` at `/m`, `.../start` at `/m/start`, each with `loader = ({ request }) => firesio.devices().startPage(request)`), the public JSON routes (`/m/api/link/start` and `/m/api/link/poll` call `firesio.devices().start(request)` / `.poll(request)`, the manifest and the service worker `.manifest(request)` / `.serviceWorker()`), and under `/app` the member's own page (`@firesio/app/ui/devices/phone`). The `/app` layout draws `PhoneShell` instead of `EmbeddedProvider` when `surface === "pwa"`, with `PhoneNav` over the app's own `items` (import `@firesio/app/ui/devices/host.css`).

**Verified on an Android emulator only** (in repair-service-ops). Not verified: iOS (Home Screen, push permission), the look next to Shopify Mobile, a real D1. Say so to the owner before shipping it to a shop.
