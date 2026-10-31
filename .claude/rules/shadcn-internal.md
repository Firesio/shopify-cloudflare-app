---
globs: ["app/routes/internal/**", "app/internal/**", "app/styles/internal/**"]
---

# Internal staff console — shadcn/ui, 100%

`/internal/**` is built from **shadcn/ui** (Radix base, `new-york` style, base
colour **neutral**) on Tailwind v4. Nothing else: no component library, no
hand-rolled replacement for something shadcn ships.

- Components live in `app/internal/components/ui/` (installed by
  `npx shadcn@latest add <name>`, configured by `components.json`). Import them
  as `~/internal/components/ui/<name>`; `cn` is `~/internal/lib/utils`.
- **Look it up before using it**: `docs/shadcn/` is a local mirror of the official
  docs (`npm run docs:shadcn:sync`). Open `components/<name>.md` and the installed
  source for the real parts and props; `examples/dashboard-01.md` is the reference
  for the shell (Sidebar inset + header + stat Cards + chart Card + Table).
- **Never write a wrapper that re-implements a shadcn part** (Page, Stack, Text,
  StatCard, EmptyState, ConfirmDialog, PasswordInput…). Compose the real ones:
  Card/CardAction for stat tiles, `Empty`, `AlertDialog`, `Dialog`, `Field*` for
  forms, `InputGroup` for password toggles and copy fields, `Skeleton`,
  `Breadcrumb` for back links, `DropdownMenu` for row actions, `Sonner` for toasts.
- Page frame: `flex flex-col gap-4 py-4 md:gap-6 md:py-6`, blocks `px-4 lg:px-6`,
  title `h1 text-2xl font-semibold tracking-tight`. Rare or secondary forms open in
  a `Dialog`; destructive actions confirm in an `AlertDialog`; every submit shows a
  `Spinner` + disabled state while pending and a toast on the result.
- The shell is dashboard-01's: `SidebarProvider` + `AppSidebar variant="inset"`
  (brand header, grouped nav from `layout-nav.ts`, `NavUser` account menu in the
  footer) + `SidebarInset` whose header carries the page title (`titleFor`). Top-level
  pages therefore have NO body `<h1>`; detail pages keep a `Breadcrumb` + `<h1>`.
- Lists are `DataTable` (`app/internal/components/data-table.tsx`, TanStack Table v8
  per docs/shadcn/components/data-table.md): toolbar (view switcher left; Columns menu +
  page action right), bordered table with muted header, rows-per-page / page x of y /
  first-prev-next-last footer. Define `ColumnDef`s per page; do not hand-roll a `<Table>`
  for a list. `useReactTable` would trip react-hooks/incompatible-library (a React Compiler advisory; this app does not use the compiler), so `eslint.config.js` turns that one rule off for `data-table.tsx` only.
- Colours come from the neutral tokens in `app/styles/internal/internal.tailwind.css`.
  Charts use `var(--primary)` and `var(--chart-2)` as in dashboard-01; no extra palette.
- App Bridge's global types add a `variant` to `React.ButtonHTMLAttributes`, which
  collides with cva. When `shadcn add` writes a component that spreads button props
  next to a `variant`, wrap them in `Omit<…, "variant">` (as `button.tsx` does).
- Re-running `shadcn add` overwrites a component: re-check `button.tsx`, `sidebar.tsx`,
  `alert-dialog.tsx`, `sonner.tsx`, `use-mobile.ts` and the `cn` import path afterwards.
- The theme switch (`ThemeToggle`) keeps the render-blocking init script instead of
  shadcn's effect-based provider, so there is no light/dark flash.
- The console stays English-only (`@rules/i18n.md`).
