---
name: add-admin-page
description: Build or change a page in the embedded Shopify admin (/app/**) with Polaris web components: route, nav, permission, translations, save bar, toast. Use for any new or edited merchant-facing admin screen.
---

# Add an embedded admin page

Rules (they load when you open `app/routes/app/**`): `polaris-app-home`, `polaris-dashboard`, `shopify-and-ui`, `i18n`, `merchant-speed`. Polaris reference: `docs/polaris/` (search with `rg`).

1. **Pick the published template first** (`Details`, `Index`, `Settings`, `Homepage`) from `docs/polaris/patterns/templates/`, then the compositions it uses. Template decides columns, actions and saving.
2. **Look up every element** you have not verified this session in `node_modules/@shopify/polaris-types/dist/custom-elements.json` (attributes, slots, allowed children).
3. **Route**: file under `app/routes/app/`, entry inside the `route("app", ...)` group in `app/routes.ts`. Declare `export const handle = { i18n: ["common", "admin"] }`.
4. **Nav**: add an `<s-link>` inside `<s-app-nav>` in `app/routes/app/_layout.tsx`, guarded with the permission that gates the page.
5. **Access**: loader and action call `guardMember(request, "<permission>")` (see `.claude/rules/members.md`, "Writing a route"). Ask for a permission, never compare a role. Hiding a link is courtesy; the server is the lock.
6. **Structure**: `<form data-save-bar>` wraps `s-page`; sections are direct children; back link in `breadcrumb-actions`; resource selection through the Resource Picker; spacing only from `s-section`/`s-stack`/`s-grid`.
7. **Every create/update**: a toast on the result (`shopify.toast.show`) and `loading` on the submitting button only.
8. **Translations**: every string through `t()` in `app/i18n/locales/<lang>/admin.json` for **every** language; dates and money through `app/i18n/format.ts`. Run `npm run i18n:sync`.
9. **Speed and loading**: the loader awaits only auth; anything else goes behind `settle()` / `<Deferred>`. The frame, headings, labels, buttons and static cards render at once; only data-dependent values are skeletons with the SAME footprint (`app/components/admin/Skeleton.tsx`, `PendingSection`; give the loaded component a `loading` state and render the same markup, see `.claude/rules/polaris-app-home.md` "Loading"). Bounded queries (`.claude/rules/merchant-speed.md`).
10. **Validate** the markup with the `shopify-plugin:shopify-polaris-app-home` skill's `validate.mjs` before calling it done.
11. **Tests**: loader, action and intent handlers on the server side. Polaris cannot be unit-tested: verify the rendering by hand and **say so**.
