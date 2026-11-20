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

## 3. The staff phone app (written, behind one switch, OFF)

An installed web app on a staff member's phone, signed in with no password: the phone shows a short code, a member confirms it in the Shopify admin, the phone gets a session (RFC 8628 device flow). It is the web admin minus the pages the deny-list closes, so a page added later works on the phone with no edit.

**Everything is already in the template; one constant connects it.** `app/core/features.ts`: `export const PWA = false;`. Set it to `true` and:

| Piece | Where it is connected | Always there, even while off |
|---|---|---|
| The device gate, `firesio.devices()`, the daily sweep | `app/firesio.server.ts`: `...(PWA ? { devices: PHONE_DEVICES } : {})` | |
| The public pages `/m`, `/m/start`; the manifest `/m/manifest.webmanifest`; the pairing calls `/m/api/link/start` and `/m/api/link/poll`; the service worker `/sw.js` | `app/routes.ts` mounts `app/routes/phone-routes.ts` | the files under `app/routes/m/`, `routes/sw.ts` |
| The member's own page about their phones, `/app/phone` | `app/routes.ts` (under the `/app` layout) | `app/routes/app/phone.tsx` |
| The phone's shell, header, actions and bottom bar | `app/routes/app/layout.tsx`: `PWA ? lazy(() => import("~/components/PhoneLayout")) : null`, drawn when `surface === "pwa"` | `app/components/PhoneLayout.tsx` |
| The three tables (`member_devices`, `device_link_requests`, `device_link_attempts`) | | `drizzle/0005_*.sql`, listed in `drizzle.config.ts`: no migration to write later, the tables are empty while off |
| The pairing rate limit | | `DEVICE_LINK_LIMITER` in `wrangler.jsonc`, top level AND `env.production` |
| The two placeholder icons (192 and 512 px) | `app/core/phone.ts` (`PHONE_DEVICES.manifest`) | `public/phone-icon-*.png` |

**What the app decides, in `app/core/phone.ts`** (the one file to read before turning it on): `PHONE_DENIED` (what a lost or borrowed phone must NOT open; the template closes the plan and the team; an empty list is a decision, never a default), the manifest's name, colours and icons (replace the placeholders: a manifest takes literal colours and at least a 192 and a 512 PNG), and `phoneItems` in `app/components/phone-items.ts` (the bottom bar: five places at most, the rest go under "More"). Words come from `devicesLabelsFor(locale)` (English, Spanish, German).

**`app/features.test.ts` holds the switch.** Turn it on with a piece missing, or leave a piece connected while it is off, and `npm run verify` says which (for example "PWA is on (app/core/features.ts) but app/routes.ts does not mount routes/sw.ts", or "wrangler.jsonc must declare DEVICE_LINK_LIMITER at the top level AND under env.production"). It also checks that the deny-list names real `/app` routes and that each icon is the size the manifest says.

**What it costs while off.** No route, no declaration, no request: measured 2026-11-20 on the built client (`scripts/bundle-budget.mjs`, run by `npm run build`): 177,040 bytes of gzip script for the admin (173,720 before POS and the switch: +3.1 KB for POS, +0.2 KB for the switch), and the phone's shell is a chunk of its own (17.7 KB gzip + 21.9 KB CSS) that is built but never requested until a paired phone opens the app. The budget fails the build when the admin's scripts pass 195,000 bytes.

**To turn it on in an app:** (1) read and edit `app/core/phone.ts`, replace the icons; (2) `PWA = true`; (3) `npm run verify`; (4) deploy: the migration is already in the history, the binding is already declared; (5) pair a phone from `/m` (on the phone) and `/app/phone` (in the Shopify admin).

**Verified:** type-check, lint, the unit and Worker tests and a production build with the switch ON and with it OFF (run once by hand with `PWA = true`, then set back). Verified on an Android emulator only, in repair-service-ops. **Not verified:** a real pairing in this template (no device was paired), iOS (Home Screen, push permission), the look next to Shopify Mobile, a real D1. Say so to the owner before shipping it to a shop.
