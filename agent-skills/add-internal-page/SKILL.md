---
name: add-internal-page
description: Add or change a page in the internal staff console (/internal/**) built with shadcn/ui: route, sidebar entry, title, table, dialogs, toasts. Use for any staff-console screen.
---

# Add an internal console page

Rule (loads when you open `app/routes/internal/**`): `.claude/rules/shadcn-internal.md`. Docs mirror: `docs/shadcn/` (`components/<name>.md`, `examples/dashboard-01.md`). The console is English-only and uses shadcn/ui only: no Polaris, no wrapper that re-implements a shadcn part.

1. **Route**: file under `app/routes/internal/`, entry inside the `layout("routes/internal/_layout.tsx", [...])` group in `app/routes.ts` (the layout requires a signed-in staff member; login pages stay outside it).
2. **Sidebar and title**: add the page to `INTERNAL_NAV` in `app/routes/internal/layout-nav.ts`, or to `EXTRA_PAGES` for a page that is not in the sidebar. `titleFor` picks the longest matching `href`, so a detail page inherits its list's title unless it has its own entry.
3. **Components**: look up the real parts first; add missing ones with `npx shadcn@latest add <name>`, then re-check `button.tsx`, `sidebar.tsx`, `alert-dialog.tsx`, `sonner.tsx` and the `cn` import (the rule explains why).
4. **Lists** use `DataTable` (`app/internal/components/data-table.tsx`) with your own `ColumnDef`s; do not hand-roll a `<Table>`.
5. **Forms**: rare or secondary forms in a `Dialog`, destructive actions in an `AlertDialog`, every submit shows a `Spinner` and a disabled state while pending plus a Sonner toast on the result (`app/internal/use-action-toast.ts`).
6. **Frame**: top-level pages have no body `<h1>` (the header carries the title); detail pages use `Breadcrumb` + `<h1>`.
7. Styles: Tailwind only in `app/styles/internal/internal.tailwind.css`; never add the Tailwind import anywhere else.
8. **Tests**: loader/action server side; check the page by hand in a browser and say so.
