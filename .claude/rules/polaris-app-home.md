---
paths:
  - "app/routes/app/**"
  - "app/components/**"
  - "extensions/**"
---

# Polaris App Home — building an embedded admin page

> **Thin shell (step 13):** the skeleton primitives (`Skeleton.tsx`), `settle()`, `<Deferred>` and `skeleton.css` described below were NOT carried over: the pages of `@firesio/app-ui` await their loaders, and the home page is static. An app whose own page streams a region re-adds them (they are in this repo's history before `template-v1.0.0`) and keeps the rules below.

An admin page is assembled from mechanisms Shopify already owns; each job has one owner. Anything built by hand in place of one looks almost right, behaves subtly differently and has no accessibility or responsive behaviour. Recipe: the `add-admin-page` skill. Full guide with the page anatomy, the toast example and the done-checklist: `docs/polaris-admin-guide.md`.

## Which Polaris

Polaris 2 (`polaris-2.js`), named in ONE place, `app/core/polaris.ts`, read by `shopifyApp({ polarisUrl })` and `EmbeddedProvider`. Never render `AppProvider` directly or add a Polaris script tag. `@shopify/polaris-types` is `^2.0.0`. Polaris 2 has `s-empty-state`, and `s-text` has `fontSize`/`fontWeight`/`fontVariantNumeric`. Custom CSS that copies Polaris colours or redraws a component pins it to the old look: remove it.

## Look up before any markup

1. **What exists**: `node_modules/@shopify/polaris-types/dist/custom-elements.json` is the authority for tag names, attributes and named slots in THIS install (62 `s-*` elements). A tag not in it is not available.
2. **The pattern**: pick the published template first (`Details`, `Index`, `Settings`, `Homepage`) from `docs/polaris/patterns/templates/`, then the compositions (index table, metrics card, resource list, setup guide, callout card). The template fixes columns, action placement and saving.
3. **Each element you have not verified this session**: attributes and accepted values, exact slot names (an unknown slot is not honoured), what may nest inside it and what it expects as parent. Read `docs/polaris/web-components/…` for the prose and examples (the Shopify docs search strips code samples; fetch the reference page for markup).
4. **Validate** with `validate_component_codeblocks` or the skill's `validate.mjs` before calling the page written.

## Which mechanism owns which job

| The job | Owner |
|---|---|
| Frame, heading, content width | `s-page` (`heading`, `inlineSize`) |
| Back to the parent screen | `<s-link slot="breadcrumb-actions">` |
| Main action that is not a save / other page actions | `<s-button slot="primary-action">` / `slot="secondary-actions"` |
| **Saving edits to a record** | **The save bar**: `<form data-save-bar>` (add `data-discard-confirmation` when work is hard to recreate), or the Save Bar API |
| Grouping and spacing between groups | `s-section`, a direct child of `s-page` |
| Secondary column | `<s-box slot="aside">` on `s-page` |
| Spacing inside a section | `s-stack` (`gap`) |
| A control sharing a row with anything | `s-grid` (`gridTemplateColumns`), e.g. `1fr auto` for field + button |
| Choosing products, variants, collections | Resource Picker, `shopify.resourcePicker(...)` |
| Choosing records your app owns | Picker API |
| Dialog / status / empty and error states / tables / metrics | `s-modal` or Modal API / `s-badge` / the published compositions |
| Feedback after a create or update | Toast API (`shopify.toast.show`) |

Consequences that pages most often get wrong:

- **Saving belongs to the save bar**, never to a button at the bottom of the form. Pick one save-bar mechanism per page (automatic `data-save-bar`, or programmatic `ui-save-bar`), never both.
- **Selecting a Shopify resource is the Resource Picker**; never ask for a handle or an ID. Store the returned GIDs and keep the title only as a display label; reopen the picker with `selectionIds`; handle the cancel (`undefined`).
- **The `<form>` wraps `s-page` from the outside.** `s-page`'s children are `s-section` and slotted elements only; anything else in between breaks its automatic slotting and spacing.
- **Spacing comes from the structure** (`s-page` → `s-section` → `s-stack`/`s-grid`); there is no hand-written CSS or layout `style` here. A form control fills the inline size it is given, so a field inside an inline `s-stack` pushes its siblings onto the next line: use `s-grid`.
- **Width**: `base` (default) for a record editor with an `aside`; `small` is a deliberate single-column short form; `large` for dashboards, analytics and wide tables.

## Forms and validity

One `<form>` per screen. Fields carry `name`, `label` and native constraints (`required`, `min`, `max`, `type`, `minLength`), which block a bad submit before any JavaScript. The server parses the submission with Zod and returns per-field reasons rendered on each field's `error`: that is the authoritative gate. `data-save-bar` has no disabled state for its save button; if a visibly disabled control is truly required, use `<s-button slot="primary-action" disabled>` or the programmatic bar.

## Loading: static first, skeletons where the data goes

**OWNER DECISION (2026-11-10), against Shopify's published guidance** (which says Polaris has no skeleton and to use a
labelled spinner): pages must feel instant and shift by nothing, so a pending value is a skeleton, not a spinner.

- **Static first.** `s-page`, headings, labels, buttons, cards and links render at once from the route component. Only a
  data-dependent value waits. Page loaders await authentication and nothing else; the rest streams (`settle()` + `<Deferred>`).
- **The skeleton is the real component with the value swapped.** Give the loaded component a `"loading"` state
  (`MetricCard`'s `reading`, `PerformanceSection`'s `performance`, `ChannelsSection`'s `channels`) and render the SAME markup:
  same section, same grid, same number of cards, columns and rows, so the two cannot drift. A table shows its real header and
  N skeleton rows (`expectedRows`).
- **Primitives** (`app/components/admin/Skeleton.tsx`): `SkeletonText({ chars, heading, fontSize, fontWeight, type })`,
  `SkeletonLines({ lines })`, `SkeletonBadge({ chars })`, `SkeletonBlock({ width, height })` (pixels only for an image or avatar
  of fixed size), `SkeletonStatus({ label })` (the ONE hidden announcement per region). A bar is a real `s-text` / `s-heading` /
  `s-badge` holding figure spaces inside an `s-box` with `background="strong"`, so its height is the real line height: **never
  write a height in pixels for text**. `PendingSection({ label, heading?, children? })` is the `Deferred` fallback for a whole
  section; pass the real static children with skeletons in them, or nothing for three lines.
- **Allowed tools**: those primitives and `app/styles/admin/skeleton.css` (below). No spinner for page or section content;
  `<s-button loading>` for a submitting button and `shopify.loading` for a route transition stay.
- **The one stylesheet.** `app/styles/admin/skeleton.css` animates `[data-skeleton]` (a mask sweep that only changes the alpha of
  what Polaris painted, so it follows light and dark; static under `prefers-reduced-motion`). It is loaded by the `/app` layout's
  `links()` only, never `root.tsx`, and targets the attribute, never an `s-*` tag. Polaris hosts are `display: contents` with the
  paint inside their shadow DOM, which is why the file gives the marked host a box. It is the only admin CSS (`styling.md`).
- **A value we already have is not a skeleton.** The home greeting shows the shop domain at once and the name replaces it.

## Every create/update gets a toast and a loading state, now

A submission that changes something and tells the merchant nothing is incomplete, not smaller.

- **Toast** once the result is known (`useActionData` in a `useEffect`, `shopify.toast.show(t(...), { isError })`). The toast is an addition: the authoritative error still renders inline, so the page is right without JavaScript.
- **`<s-button loading={busy}>`** on the one control that submitted, not a page spinner and not `disabled`. On a row of independent actions, compute the pending one from `useNavigation().formData` (intent and id) so only that row shows `loading`.

## Markup

`s-*` elements are global custom elements: no import (types come from `@shopify/polaris-types`; there is no `@shopify/polaris` package). Attribute names are camelCase (`inlineSize`, `gridTemplateColumns`). Booleans take bare shorthand or an expression; keyword attributes always take a string (`padding="base"`). Events: `onClick`, `onInput` and `onChange` work on `s-*` elements when the event bubbles; an event that does not bubble or has its own name (`dismiss`, `droprejected`, `error`) must be listened for on the element with `useElementEvent` (`app/admin/use-element-event.ts`). Every user-visible string goes through `t()` and must survive a ~30% longer translation. Components under `app/components/` stay presentational: props in, JSX out, no fetching, no `.server` imports.

## Tests

Test the server side (loader, action, intent handlers, payload builders). Polaris web components cannot be meaningfully unit-tested: verify the rendering by hand and say it was verified by hand (`.claude/rules/testing.md`).
