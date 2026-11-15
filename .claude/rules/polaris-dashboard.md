---
paths:
  - "app/routes/app/home*"
  - "app/routes/app/_layout*"
---

# Polaris dashboard pages

Before changing a dashboard, look up the Homepage template and the compositions in the Shopify docs through the `shopify-plugin:shopify-polaris-app-home` skill (its `scripts/search_docs.mjs`) or the Shopify dev MCP (`.mcp.json`): use the Homepage template for a merchant
landing screen, Metrics card for the first summary row, and Index table for a
manageable collection. Look up every element used. The installed
`@shopify/polaris-types` manifest remains authoritative when the docs and the package differ.

Use `<s-page inlineSize="large">` for dashboards and keep each
`<s-section>` as a direct child of the page. Put responsive columns in
`<s-grid>` with an explicit `gridTemplateColumns`, and use `<s-stack>` for
vertical or inline groups whose children size to their content. Cards are
`<s-box border="base" borderRadius="base" padding="base">`; do not add CSS or
inline spacing to imitate Polaris.

Dashboard metrics must have a label from a label object, a locale-formatted value, and
comparison context only when the comparison is meaningful. Money is formatted
from integer minor units plus its currency, and counts from numbers, with
`Intl.NumberFormat` and the shop's locale (the template has no formatting
helper yet). All visible copy, including table headings, activity labels, and
placeholder names, belongs in the label objects of `app/i18n/labels.ts` for every
supported language.

Keep the page useful when data is empty: use the `s-empty-state` component
(a Polaris 2 component, not a composition) with one clear next action instead of
rendering an empty table.
Page-level actions belong in `primary-action` or `secondary-actions` slots;
record edits use the save bar. Validate every new Polaris element and prop with
the App Home skill validator before considering the route complete. A checklist
may use `s-checkbox` for merchant actions; keep expansion controls separate so
checking a step never accidentally opens or closes its details.
