# Template changes — 2026-10-15 batch (port guide)

Everything changed on the template between `fb4c4fa` (last commit before this batch) and `8d14459`.
Use this to bring the same work into an app that was created from the template.

| Commit | What |
|---|---|
| `49dd877` | Install flow: App Store link once the app has a handle |
| `e0ee627` | Staff notification topics + ports (groundwork) |
| `8bc22c5` | Internal console rebuilt on shadcn/ui, dashboard-01 layout |
| `f002d3a` | Web push for staff + per-person notification settings |
| `e5455af` | Centred, fixed-width narrow pages |
| `8d14459` | Push: local dev seeding, delivery confirmation, tunnel-safe CSRF |

Totals: 371 files, of which ~70 are the mirrored shadcn docs and the lockfile. The code is four independent workstreams. Port them in this order; each one leaves the app green.

```
A  Install flow            (small, no deps, no migrations)         49dd877
B  shadcn internal console (large, removes ngk-dashboard)          8bc22c5 e5455af
C  Web push + settings     (needs B's UI parts, 2 migrations)      e0ee627 f002d3a 8d14459
```

C depends on B (its page is built from shadcn parts, `Switch`, `Item`, `AlertDialog`, the shell nav). A is independent.

## How to apply

Add the template as a remote and move changes by commit or by path, never by copying the whole tree (app-specific files differ).

```bash
git remote add template <template-repo-url>
git fetch template

# whole workstream by commit (resolve conflicts in app-specific files)
git cherry-pick -n 49dd877                  # A
git cherry-pick -n 8bc22c5 e5455af          # B
git cherry-pick -n e0ee627 f002d3a 8d14459  # C
# -n leaves it staged so you can review, run npm run verify, then commit

# or only some paths from a commit range, as a patch with a 3-way merge
git diff fb4c4fa 8d14459 -- app/lib/install-target.ts app/routes/public | git apply --3way
```

Skip `docs/shadcn/` in patches (50k lines) and regenerate it instead: `npm run docs:shadcn:sync`. Regenerate `package-lock.json` with `npm install` rather than applying it.

After each workstream: `npm install && npm run cf-typegen && npm run verify`. `npm run build` is safe on a laptop (`scripts/ci-release.mjs` exits immediately unless `WORKERS_CI` is set) but never run `ci-release.mjs` itself, `migrate.mjs --remote` or `wrangler deploy` to "test".

---

## A. Install flow (`49dd877`)

**Why.** Shopify App Store requirement 2.3.1: install must start on a Shopify surface and the app must not ask for a shop domain. The manual form is still needed while unlisted, so a config value selects the flow.

**Behaviour.** `SHOPIFY_APP_HANDLE` empty or malformed → the domain form on the landing page and `/auth/login` (as before; malformed also logs `install_target.invalid_handle`). A valid handle → every Install button links to `https://apps.shopify.com/<handle>`, no form is rendered, `/auth/login` redirects to the listing (a request carrying a valid `?shop=` still reaches the library).

**Files (copy as is):**
- `app/lib/install-target.ts` + `.test.ts` (the single pure decision)
- `app/routes/public/install-button.tsx` (`useInstallTarget`, `InstallLink`), `install.render.test.tsx`
- changed: `app/routes/public/{_layout,landing,pricing}.tsx`, `app/routes/auth/login.tsx`, `app/routes/auth/login.app-store.test.ts`
- `app/i18n/locales/{en,es}/public.json`: key `landing.appStoreCta` (add to every locale the app has)
- `.claude/rules/shopify-api-invariants.md`: the "App Store install requirements" section

**Config.** `wrangler.jsonc`: var `SHOPIFY_APP_HANDLE: ""` at the top level AND under `env.production.vars` (named envs do not inherit). Run `npm run cf-typegen`. Document it in `.dev.vars.example`.

**Per app.** Set the production handle before the live submission, otherwise production keeps asking for a shop domain. If the app has extra "install" links elsewhere, route them through `InstallLink`.

---

## B. shadcn/ui internal console (`8bc22c5`, `e5455af`)

**Why.** Replaces `ngk-dashboard` with real shadcn/ui (neutral) and the layout of shadcn's `dashboard-01`.

**Dependencies.** Remove `ngk-dashboard`. Add `@tanstack/react-table@^8`, `class-variance-authority`, `clsx`, `cmdk`, `radix-ui`, `sonner`, `tailwind-merge` (keep `lucide-react`, `recharts`, `tw-animate-css`). Add `"docs:shadcn:sync"`.

**Files.**
- Config: `components.json` (style new-york, base colour neutral, aliases `~/internal/...`, css `app/styles/internal/internal.tailwind.css`)
- `app/styles/internal/internal.tailwind.css`: neutral tokens, no `ngk` `@source`, no custom chart palette
- `app/internal/components/ui/*` (35 shadcn parts), `app/internal/lib/utils.ts` (`cn`), `app/internal/hooks/use-mobile.ts`
- `app/internal/components/data-table.tsx` (+ tests): the `DataTable` used by every list
- Shell: `app/routes/internal/{_layout,app-sidebar,nav-user,command-menu,layout-nav}.tsx|ts`, `ThemeToggle.tsx` (light/dark/system)
- Pages: everything under `app/routes/internal/**` and `app/internal/components/**`. Port only the pages the app has (dashboard, shops, support, admins, subscriptions, AI, MCP, profile).
- `vite.config.ts`: `optimizeDeps.include` gains `radix-ui`, `sonner`, `class-variance-authority`, `clsx`, `tailwind-merge`, drops `ngk-dashboard`
- Docs: `.claude/rules/shadcn-internal.md`, `.claude/rules/styling.md`, `AGENTS.md` (link to the rule), `scripts/sync-shadcn-docs.mjs`, `docs/shadcn/` (regenerate)
- App-level: `app/components/support/InternalAttachmentPicker.tsx` and `app/routes/api/oauth/authorize.tsx` also imported ngk

**Per app (customise).**
- `layout-nav.ts` (`INTERNAL_NAV`, `titleFor`) lists that app's pages
- `identity.brandName` shows in the sidebar header
- Pages not in the template (an app's own admin pages) must be rebuilt from shadcn parts; use `docs/shadcn/components/<name>.md`. Rules in `.claude/rules/shadcn-internal.md`: no body `<h1>` on top-level pages (the shell header shows the title), lists are `DataTable`, narrow pages `mx-auto w-full max-w-3xl`, detail pages `max-w-5xl`.
- `DataTable` features to wire per list: `search`, `rowHref` (whole row clickable), `compactHidden` (columns dropped on narrow screens), `stickyEnd` (pinned actions column), `toolbarStart/End`.

**Gotchas (each cost time).**
1. **App Bridge types collide with cva.** `@shopify/app-bridge-types` augments `React.ButtonHTMLAttributes` with its own `variant`. Components that spread button props next to a cva `variant` need `Omit<…, "variant">`. Already applied in `button.tsx`, `sidebar.tsx`, `alert-dialog.tsx`; re-check them after any `shadcn add`.
2. **`npx shadcn add` bugs.** It installs a bogus npm package `cn` and may downgrade `recharts`; it writes `import … from "cn"`. Fix imports to `~/internal/lib/utils`, `npm uninstall cn`, keep `recharts` at the template's version. It also overwrites components you adapted (list above plus `sonner.tsx`, `use-mobile.ts`).
3. **Dev "Cannot read properties of null (reading 'useCallback')".** Vite discovered `radix-ui` late and pre-bundled two Reacts. Fixed by the `optimizeDeps.include` entries; clear `node_modules/.vite` once.
4. **`useReactTable` lint warning** (`react-hooks/incompatible-library`) is expected and accepted (1 warning). `DataTable` needs a stable `data` reference (memoise filtered arrays), otherwise TanStack resets the page on every render.
5. **React Compiler lint** rejected shadcn's `Math.random` in `SidebarMenuSkeleton` and `setState` in `use-mobile`; both are rewritten (`useId`, `useSyncExternalStore`).
6. **Shop logos are blocked by the CSP** (`img-src 'self' data:`), so avatars always show the fallback icon. Decision pending: keep, or stop requesting remote images.
7. React logs "script tag while rendering" for the theme init script (harmless; it runs on the server render).

---

## C. Web push + notification settings (`e0ee627`, `f002d3a`, `8d14459`)

**Why.** Staff get browser/phone notifications for ticket events and shop installs/uninstalls, and configure topic × channel (email, push) and per device. Full design and decisions: `.claude/rules/web-push.md`.

**Dependencies.** None (crypto is WebCrypto in `app/lib/web-push`; npm `web-push` does not run on Workers).

**Migrations (additive, forward-only).** `drizzle/0029_*.sql` (`push_subscriptions`, `admin_notification_preferences`, no `shop` column so the purge guard is untouched) and `0030_staff_notification_legacy_mute.sql` (copies the old `notify_support = 0` into preference rows so nobody who muted tickets starts getting email). **Renumber if the app already has migrations 0029/0030**: regenerate with `npm run db:generate` from the schema files and re-create the data migration with `drizzle-kit generate --custom`; never edit an applied migration. The `notify_support` column stays (drop it in a later, separate deploy).

**Files.**
- Domain (pure): `app/domain/{staff-notification-topics,staff-notification-view,push-device,shop-announcement}.ts`
- Crypto + sender: `app/lib/{base64url,vapid-config,same-origin,internal-manifest}.ts`, `app/lib/web-push/*`, `app/adapters/web-push-sender.server.ts`, `app/test/web-push-decrypt.ts`
- Data: `app/db/schema/push.ts` (+ barrel export), `app/models/{push-subscriptions,staff-notifications}.server.ts`, `app/schemas/push-subscription.ts`
- Ports: `app/ports/{push-subscriptions,staff-notifications,push-sender,push-transport}.ts`
- Notification system: `app/notifications/channels/push/*`, `app/notifications/staff-topic.ts`; edits to `types.ts`, `catalogue.ts`, `payloads.ts`, `envelope.ts`, `dispatch.server.ts`, `notify.server.ts`, `eligibility/*`, `app/services/notification-enqueue.ts`, `app/emails/*` (new events `shop_installed`, `shop_uninstalled`, `push_test`; email builder map now has `null` for push-only events)
- Services: `app/services/staff-notifications.ts` + `staff-notifications/*`, `announce-shop-change.ts`
- Sources: `SupportService.notifyStaff` (`app/services/support.server.ts`), `afterAuth` in `app/shopify.server.ts`, `recordUninstall` (`app/services/record-uninstall.ts`)
- Wiring: `app/wiring/{push,staff-notifications,shop-announcements}.server.ts` + edits to `notifications`, `webhooks`, `ai-support`, facade `app/wiring.server.ts`
- Route + UI: `app/routes/internal/notifications.tsx`, `notifications-intents.server.ts`, `notifications/*`, `manifest.webmanifest.ts`, `app/internal/push/*`; `routes.ts` entries (`internal/notifications`, `internal/manifest.webmanifest` outside the auth layout); nav items in `nav-user.tsx` and `command-menu.tsx`
- Browser assets: `public/internal-sw.js`, `public/_headers`, `public/internal-icons/*` (**regenerate the icons from the app's own mark**), `_layout.tsx` links (manifest, apple-touch-icon, theme-color)
- Scripts: `scripts/{generate-vapid-keys,seed-vapid-dev}.mjs` (+ test), package.json scripts `push:keys`, `push:seed-dev` (added to `predev`/`predev:local`), `test` script includes the new node test
- Config: `eslint.config.js` (service-worker globals for `public/**/*.js`), `vitest.config.ts` (blank `VAPID_*` bindings and the crypto/sender tests listed in `EXPLICIT_WORKERS`), `wrangler.jsonc` (below)

**Config.**
- `wrangler.jsonc` vars: `VAPID_PUBLIC_KEY: ""` top level AND `env.production.vars`; top level also `VAPID_PRIVATE_KEY: ""` (**local-dev slot only**: wrangler loads only declared names from `.dev.vars` once a `secrets` block exists). `env.production` must NOT declare the private key.
- `VAPID_PRIVATE_KEY` is deliberately NOT in `secrets.required` (a missing required secret fails the deploy; push is optional and simply shows "not set up").
- `npm run cf-typegen`; document both in `.dev.vars.example`.
- Production: `npm run push:keys`, public key into `env.production.vars`, `npx wrangler secret put VAPID_PRIVATE_KEY --env production`. Changing the pair invalidates every browser subscription.
- The VAPID subject is `SHOPIFY_APP_URL` and must be `https://`.

**Per app (customise).**
- Topics/events: `STAFF_TOPIC_SPECS` (labels, defaults) and the event sources. Drop topics the app does not have; add the app's own (one catalogue entry + a source + a test).
- Remove the legacy `notifySupport` flag/switch from `AdminUser`, the port, repo, KV session-cache schema and `support/index.tsx` (the template did; the column stays).
- Push-endpoint allowlist (`isAllowedPushEndpoint`) is ours: FCM, Mozilla, Apple, Windows. Unknown push services fail closed.
- The device-handover logic assumes one console origin per app.

**Gotchas.**
1. **Tunnel dev.** The Worker sees `http` while the browser's `Origin` is `https` behind a tunnel: `isSameOriginRequest(origin, url, SHOPIFY_APP_URL)` accepts the configured app URL too, else every settings action 403s.
2. **Each `npm run dev` restart changes the tunnel host = a new origin**: old devices become unreachable. Remove them and re-enable.
3. **Tests must not read `.dev.vars`**: `vitest.config.ts` blanks `VAPID_*`, otherwise "push not configured" tests fail on a machine with local keys.
4. **`afterAuth` fires on token renewals too**: install announcements use `decideInstallAnnouncement` (announce only when there was no shop row or it had uninstalled); Partner back-fill never announces.
5. **Subscribe can hang** (Chromium without Google services, Brave with push off): bounded by `SUBSCRIBE_TIMEOUT_MS`.
6. **"Sent" is not "shown"**: the OS can hide banners (Focus Assist, DND). The worker posts `push-received` to open console windows and the page toasts "Delivered to this device".
7. **iOS** needs the console installed to the Home Screen (manifest + icons are included). Headless Chromium cannot subscribe, so real delivery is only verified by hand on a device. Verified locally: crypto vs RFC 8291 vector, real FCM accepted the request (410 for a fake token) and the device was removed.
8. The `node --test` port test (`scripts/localhost-port.test.mjs`) fails if a dev server is running; stop it before `npm run verify`.

---

## Verification checklist per app

```bash
npm install
npm run cf-typegen                 # after wrangler.jsonc changes
npm run db:generate                # only if schema changed; check drizzle/ is additive
npm run db:migrate:local           # local only
npm run verify                     # typecheck + lint (1 known warning) + full suite
```

Manual: sign in to `/internal`, open every page at desktop and phone width; `/internal/notifications` shows "Enable on this device" (dev seeds keys); with `SHOPIFY_APP_HANDLE` set, `/` shows only the App Store link and `/auth/login` redirects.

Deploy notes: migrations 0029/0030 apply on deploy (additive). Push stays off until the production VAPID values are set. Set `SHOPIFY_APP_HANDLE` in production before the live submission.
