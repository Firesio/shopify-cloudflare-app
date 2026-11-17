---
name: audit-admin-page
description: Review an embedded admin page (Polaris) or a whole admin area for rule violations, UX problems and speed, and sort the findings. Use when asked to check, audit or review merchant-facing pages, or before calling a page done.
---

# Audit an admin page

Read-only unless asked to fix. Standards: `.claude/rules/polaris-app-home.md` (incl. "Loading"), `shopify-and-ui.md`, `merchant-speed.md`, `core.md`, `testing.md`, `docs/polaris-admin-guide.md`.

1. **Elements**: for every `s-*` tag, attribute, slot and nesting, check `node_modules/@shopify/polaris-types/dist/custom-elements.json` (and the component's reference page in the Shopify docs). Verify a finding yourself before reporting it (an earlier audit wrongly called `s-spinner size="large"` invalid; the manifest allows it).
2. **Rules**: the right mechanism owns each job (save bar, back link, Resource Picker, spacing from `s-section`/`s-stack`/`s-grid`); no custom CSS or style attribute on an admin page; `<form>` wraps `s-page`.
3. **States**: loading (static first; a streamed region has a same-shape fallback and one `role=status`; the template ships no skeleton helper), empty (`s-empty-state`), error (the route's error boundary, or an error state of the page's own for a streamed region), and the state the server can refuse (a button is never offered that the server rejects).
4. **Feedback**: a toast and a `loading` button on every create/update; field errors on the field; unsaved changes through the save bar.
5. **Accessibility**: labels, heading order, meaning not carried by tone alone, focus after a modal.
6. **Words**: no hardcoded aria-labels; strings through the label objects of `app/i18n/`; dates and money through `Intl` with the shop's zone and locale.
7. **Speed**: the loader awaits only auth; every outbound call has a timeout; no per-row query; polling is bounded.
8. **Sort every finding** (`CLAUDE.md`, "What this repo is"): *template defect* (fix), *per-app decision* such as copy, prices, legal, SLA (leave), *intentional seam* with no caller here (keep). Placeholders are never findings.
9. Report a table: severity, file:line, what, why, fix; then what you checked and what you could not (you cannot render the UI).
