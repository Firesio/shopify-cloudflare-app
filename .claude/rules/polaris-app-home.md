---
paths:
  - "app/routes/app/**"
  - "app/components/**"
  - "extensions/**"
---

# Polaris App Home — building an embedded admin page

An admin page is assembled from mechanisms Shopify already owns; each job has one owner. Anything built by hand in place of one looks almost right, behaves subtly differently and has no accessibility or responsive behaviour. Recipe: the `add-admin-page` skill. Full guide with the page anatomy, the toast example and the done-checklist: `docs/polaris-admin-guide.md`.

## Which Polaris

Polaris 2 (`polaris-2.js`), named in ONE place, `app/admin/polaris.ts`, read by `shopifyApp({ polarisUrl })` and `EmbeddedProvider`. Never render `AppProvider` directly or add a Polaris script tag. `@shopify/polaris-types` is `^2.0.0`. Polaris 2 has `s-empty-state`, and `s-text` has `fontSize`/`fontWeight`/`fontVariantNumeric`. Custom CSS that copies Polaris colours or redraws a component pins it to the old look: remove it.

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

## Every create/update gets a toast and a loading state, now

A submission that changes something and tells the merchant nothing is incomplete, not smaller.

- **Toast** once the result is known (`useActionData` in a `useEffect`, `shopify.toast.show(t(...), { isError })`). The toast is an addition: the authoritative error still renders inline, so the page is right without JavaScript.
- **`<s-button loading={busy}>`** on the one control that submitted, not a page spinner and not `disabled`. On a row of independent actions, compute the pending one from `useNavigation().formData` (intent and id) so only that row shows `loading`.

## Markup

`s-*` elements are global custom elements: no import (types come from `@shopify/polaris-types`; there is no `@shopify/polaris` package). Attribute names are camelCase (`inlineSize`, `gridTemplateColumns`). Booleans take bare shorthand or an expression; keyword attributes always take a string (`padding="base"`). Every user-visible string goes through `t()` and must survive a ~30% longer translation. Components under `app/components/` stay presentational: props in, JSX out, no fetching, no `.server` imports.

## Tests

Test the server side (loader, action, intent handlers, payload builders). Polaris web components cannot be meaningfully unit-tested: verify the rendering by hand and say it was verified by hand (`.claude/rules/testing.md`).
