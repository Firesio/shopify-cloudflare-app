---
title: Badge
description: >-
  The badge component displays status information or indicates completed actions
  through compact visual indicators. Use badge to communicate object states,
  order statuses, or system-generated classifications that help users quickly
  understand item conditions.
api_version: v2.0
source_url:
  html: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/badge
  md: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/badge.md
api_name: app-home
---

# Badge

The badge component displays status information or indicates completed actions through compact visual indicators. Use badge to communicate object states, order statuses, or system-generated classifications that help users quickly understand item conditions.

Badges support multiple tones and sizes, with optional icons to reinforce status meaning and improve scannability in lists and tables. For user-created labels, categories, or tags, use [chip](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/chip) instead.

#### Use cases

* **Status indicators:** Display order status like "Fulfilled," "Pending," or "Cancelled" for quick visibility.
* **Inventory states:** Show product availability like "In Stock," "Low Stock," or "Out of Stock."
* **Processing status:** Indicate processing states like "Syncing," "Complete," or "Failed."
* **Labels and tags:** Categorize items with labels like "Featured," "New," or "Sale."

```html
<s-badge>Fulfilled</s-badge>
```

***

## Properties

Configure the following properties on the badge component.

* **color**

  **"base" | "strong"**

  **Default: 'base'**

  Controls the visual weight and emphasis of the badge.

  * `base`: Standard weight with moderate emphasis, suitable for most use cases.
  * `strong`: Increased visual weight for higher emphasis and prominence.

* **icon**

  **"" | "replace" | "search" | "split" | "link" | "edit" | "info" | "incomplete" | "complete" | "product" | "variant" | "collection" | "select" | "color" | "money" | "order" | "code" | ... 588 more ... | "x-circle-filled"**

  **Default: ''**

  An icon displayed inside the badge to provide additional visual context or reinforce the badge's meaning. Accepts any icon name from the icon library or a custom string identifier.

* **size**

  **"base" | "large" | "large-100"**

  **Default: 'base'**

  The size of the badge.

  * `base`: Default size suitable for most badge use cases.
  * `large`: Larger badge for increased visibility and prominence.
  * `large-100`: Extra large badge for maximum visibility in emphasized contexts.

* **tone**

  **"info" | "success" | "warning" | "critical" | "auto" | "neutral" | "caution"**

  **Default: 'auto'**

  The semantic meaning and color treatment of the component.

  * `info`: Informational content or helpful tips.
  * `success`: Positive outcomes or successful states.
  * `warning`: Important warnings about potential issues.
  * `critical`: Urgent problems or destructive actions.
  * `auto`: Automatically determined based on context.
  * `neutral`: General information without specific intent.
  * `caution`: Advisory notices that need attention.

### Slots

The badge component supports slots for additional content placement within the component. Learn more about [using slots](https://shopify.dev/docs/api/polaris/using-polaris-web-components#slots).

* **children**

  **HTMLElement**

  The text label displayed within the badge component, typically a short status indicator or category label.

***

## Examples

### Add status badges with tones

Create badges with different tones to represent statuses. This example shows the tones `auto` (implicit default), `info`, `success`, `caution`, `warning`, and `critical`.

## html

```html
<s-badge>Fulfilled</s-badge>
<s-badge tone="info">Draft</s-badge>
<s-badge tone="success">Active</s-badge>
<s-badge tone="caution">Open</s-badge>
<s-badge tone="warning">On hold</s-badge>
<s-badge tone="critical">Action required</s-badge>
```

### Add icons to status badges

Combine tones with icons to provide stronger visual cues. This example shows product and inventory status badges with icons that reinforce meaning.

## html

```html
<s-stack gap="base">
  <!-- Product status -->
  <s-stack direction="inline" gap="base">
    <s-badge tone="success" icon="view">Active</s-badge>
    <s-badge tone="warning" icon="clock">Scheduled</s-badge>
    <s-badge tone="critical">Archived</s-badge>
  </s-stack>


  <!-- Inventory status -->
  <s-stack direction="inline" gap="base">
    <s-badge tone="success">In stock</s-badge>
    <s-badge tone="warning" icon="alert-triangle">Low stock</s-badge>
    <s-badge tone="critical">Out of stock</s-badge>
  </s-stack>
</s-stack>
```

### Display badges in a table

Place badges inside [table cells](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table) to give merchants a scannable overview of status information. This example shows fulfillment and payment badges in an order table.

## html

```html
<s-table>
  <s-table-header-row>
    <s-table-header>Order</s-table-header>
    <s-table-header>Fulfillment</s-table-header>
    <s-table-header>Payment</s-table-header>
  </s-table-header-row>
  <s-table-body>
    <s-table-row>
      <s-table-cell>#1001</s-table-cell>
      <s-table-cell>
        <s-badge tone="success">Fulfilled</s-badge>
      </s-table-cell>
      <s-table-cell>
        <s-badge tone="success">Paid</s-badge>
      </s-table-cell>
    </s-table-row>
  </s-table-body>
</s-table>
```

### Control badge size for emphasis

Use the `size` property to create visual hierarchy between badges. This example shows the base size for standard usage and the large size for badges that need more prominence.

## html

```html
<s-stack direction="inline" gap="base">
  <s-badge size="base">New</s-badge>
  <s-badge size="large">Attention needed</s-badge>
</s-stack>
```

***

## Best practices

* **Choose the right size:** Use `base` size in table cells, list items, or when showing multiple badges together. Use `large` size for standalone badges that need emphasis, like a primary status indicator at the top of a page.
* **Keep labels to 1-2 words:** Use concise labels like **Fulfilled**, **Partially refunded**, or **Out of stock**. Always use past tense for status labels: **Refunded** not **Refund**.
* **Use appropriate tones:** Apply `critical` for errors or urgent issues needing action, `warning` for problems requiring attention, `success` for positive confirmations, and `info` for neutral statuses. Use consistent tones for the same status across your app.
* **Position in content flow:** Place badges adjacent to the items they describe. In list items, position them near the title. In tables, place them in their own column for scannability.
* **Know when not to use badges:** Badges are static, system-generated indicators. Don't use badges for merchant-created tags or removable items.

***

## Limitations

* Badge text truncates with an ellipsis when it exceeds the available width. Truncated text isn't accessible via tooltip, so keep labels concise.
* Badge text never wraps to multiple lines. Long labels will truncate rather than expand the badge height.
* Only specific predefined icons from the admin icon set are supported. Custom icons or images can't be used. The icon always appears to the left of the text and can't be repositioned.

***
