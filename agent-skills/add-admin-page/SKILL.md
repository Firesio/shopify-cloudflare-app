---
name: add-admin-page
description: Build or change a page in the embedded Shopify admin (/app/**) with Polaris web components, or mount a @firesio/app page (`ui/*`). Use for any new or edited merchant-facing admin screen.
---

# Add an embedded admin page

Rules (they load when you open `app/routes/app/**`): `polaris-app-home`, `polaris-dashboard`, `shopify-and-ui`. Polaris reference: `docs/polaris/` (search with `rg`).

**First ask: is it a page the libraries already have?** Support, members, plans (and, once mounted, notifications and content) are `@firesio/app/ui/*` route modules: add a two-line file (`export { default, loader, action } from "@firesio/app/ui/<group>/<page>";`) and the route in `app/routes.ts`; `firesio.adminMiddleware` (the /app layout's) already hands them their deps, and the words come from the `labels` option of `createFiresio` (`app/i18n/labels.ts`). The notifications and content pages are wired by the same middleware once the app declares `notifications` (a type of its own) or `content.catalogue` in `createFiresio`; mount them at `paths.content` and the like. To change such a page, change the library (platform repo), not a copy here.

For the app's own page:

1. **Pick the published template first** (`Details`, `Index`, `Settings`, `Homepage`) from `docs/polaris/patterns/templates/`, then the compositions it uses.
2. **Look up every element** you have not verified this session in `node_modules/@shopify/polaris-types/dist/custom-elements.json`.
3. **Route**: file under `app/routes/app/`, entry inside the `route("app", ...)` group of `app/routes.ts`; a link in `AppNav` (`app/components/AppNav.tsx`) for the permission that gates it.
4. **Access**: the layout's `middleware = [firesio.adminMiddleware]` authenticates and admits; loader and action then call `const { shop, member, services } = firesio.from(context); firesio.requirePermission(member, "<permission>")`; a permission name that `MEMBERS` does not declare does not compile. Hiding a link is courtesy; the server is the lock.
5. **Structure**: sections are direct children of `s-page`; spacing only from `s-section`/`s-stack`/`s-grid`; a toast on every create/update; `loading` on the submitting button only.
6. **Words**: plain strings in a label object built per language in `app/i18n/labels.ts`; dates and money through `Intl` with the shop's zone and locale.
7. **Speed**: the loader awaits only what the page cannot render without; bounded queries.
8. **Validate** the markup with the `shopify-plugin:shopify-polaris-app-home` skill's `validate.mjs`.
9. **Tests**: loaders, actions and the guard on the server side. Polaris cannot be unit-tested: verify the rendering by hand and **say so**.
