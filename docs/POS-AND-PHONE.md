# The POS webview and the staff phone app (opt-in)

`@firesio/app` 1.0.0 can serve the app's `/app` pages inside the **Shopify POS app** and on a **staff member's phone** (an installed web app), with the SAME pages: a page declares what its actions are and each surface draws them. Nothing here is on in the template. An app that needs neither changes nothing and pays nothing (no code in its bundle, no table, no route, no stylesheet). Design: the platform repo, `docs/architecture.md` section 6.12 and `docs/tickets/21-surface-devices.md`; the package's own words: `@firesio/app/surface`, `ui/surface`, `devices`, `ui/devices` (each has a README).

## 1. A page's actions (do this in every app, it costs nothing)

A page draws its actions with `PageActions` from `@firesio/app/ui/surface` as the LAST child of `s-page`, never with `slot="primary-action"` / `slot="secondary-actions"` written by hand:

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

In the web admin this is the header slots, exactly as before. Name a capability (`requires`: `scanner`, `share`, `picker`, `resourcePicker`, `register`) when a control needs a facility the host may lack; name a surface (`on`, `OnSurface`) only for work that really belongs to one. Test a page with `pageOnEverySurface(<Page />)` (`@firesio/app/ui/surface/testing`); hold the rules with `pageActionsFindings` (`@firesio/app/ui/surface/testing/guard`, needs `typescript`) over `app/routes/app/**` in a guard test.

## 2. Serve the Shopify POS webview

1. `shopify.app.toml`: `[pos] embedded = true`.
2. `app/firesio.server.ts`: `surface: {}` in `createFiresio`.
3. A route for the page's own report of where it runs, under the `/app` layout: `app/routes/app/surface.ts` with `export { action, loader } from "@firesio/app/ui/surface/report";` and the line in `app/routes.ts`.
4. The `/app` layout: the loader returns `surface: firesio.maybeFrom(context).surface`; the component wraps its outlet in `SurfaceProvider` (`surface`, `labels={surfaceLabelsFor(locale)}`), mounts `<SurfaceReporter assumed={surface} />`, and where `surface === "pos"` draws `<PageActionsHost back={...} />` before the outlet and `<PageActionsSpacer />` after it (`back` is the page's parent address, which only the app knows; `null` on its home).
5. `import "@firesio/app/ui/surface/pos.css";` in the layout (the one stylesheet of the POS bar).

What each surface SHOWS (dashboard regions, printing, the detail page) is the app's own table over `Surface`; the package does not decide it.

## 3. Serve the staff phone app

Needs a Workers Rate Limiting binding `DEVICE_LINK_LIMITER` (top level AND `env.production`), a migration for the three tables of `@firesio/app/devices/d1` (add `node_modules/@firesio/app/src/devices/d1/schema.ts` to `drizzle.config.ts`, `npm run db:generate`, check the SQL), and in `createFiresio`:

```ts
devices: { denied: [{ prefix: "settings/billing", why: "the plan and billing" }, { prefix: "settings/team", why: "team management" }], manifest: { /* name, colours, icons */ } },
```

`denied` is REQUIRED (an explicit `[]` is a decision): the phone is the web admin minus the pages listed, so a page added later works on the phone with no edit. List what a lost or borrowed phone must not be able to do. Then mount, one line each: the public pages (`@firesio/app/ui/devices/install` at `/m`, `.../start` at `/m/start`, each with `loader = ({ request }) => firesio.devices().startPage(request)`), the public JSON routes (`/m/api/link/start` and `/m/api/link/poll` call `firesio.devices().start(request)` / `.poll(request)`, the manifest and the service worker `.manifest(request)` / `.serviceWorker()`), and under `/app` the member's own page (`@firesio/app/ui/devices/phone`). The `/app` layout draws `PhoneShell` instead of `EmbeddedProvider` when `surface === "pwa"`, with `PhoneNav` over the app's own `items` (import `@firesio/app/ui/devices/host.css`).

**Verified on an Android emulator only** (in repair-service-ops). Not verified: iOS (Home Screen, push permission), the look next to Shopify Mobile, a real D1. Say so to the owner before shipping it to a shop.
