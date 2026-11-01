---
title: Section
description: >-
  The section component groups related content into clearly-defined thematic
  areas with consistent styling and structure. Use section to organize page
  content into logical blocks, each with its own heading and visual container.
api_version: v2.0
source_url:
  html: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section
  md: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section.md
api_name: app-home
---

# Section

The section component groups related content into clearly-defined thematic areas with consistent styling and structure. Use section to organize page content into logical blocks, each with its own heading and visual container.

Sections adjust heading levels automatically with nesting depth, so the document outline stays meaningful and accessible. Shopify controls their visual treatment. For simple visual separation without headings, use [divider](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/divider).

#### Use cases

* **Content grouping:** Group related content with automatic semantic heading levels.
* **Form organization:** Organize complex forms into logical, visually distinct sections.
* **Nested structure:** Create nested sections for hierarchical content organization.
* **Contextual styling:** Benefit from context-aware section styling controlled by Shopify.

```html
<s-section heading="Order details">
  <s-paragraph>Review the items and delivery details for this order.</s-paragraph>
</s-section>
```

***

## Properties

Configure the following properties on the section component.

* **accessibility​Label**

  **string**

  A label that describes the purpose or content of the component for assistive technologies like screen readers. Use this to provide additional context when the visible content alone doesn't clearly convey the component's purpose.

* **heading**

  **string**

  The heading text displayed at the top of the section. This heading provides a title for the section's content and automatically uses the appropriate semantic heading level (h2, h3, h4) based on nesting depth to maintain proper document structure.

* **padding**

  **"base" | "none"**

  **Default: 'base'**

  The padding applied to all edges of the element's content.

  * `base`: applies padding that is appropriate for the element. Note that it might result in no padding if this is the right design decision in a particular context.
  * `none`: removes all padding from the element's content. This can be useful when elements inside the section need to span to the edge of the section. For example, a full-width image. In this case, rely on `s-box` with a padding of 'base' to bring back the desired padding for the rest of the content. The `heading` and header actions keep their padding, so they can be combined with `none`.

* **subheading**

  **string**

  Supporting text that expands on the heading, rendered beneath it in a subdued treatment.

  This is not a heading: it adds no entry to the document outline, doesn't change the heading level of the section's children, and isn't announced as part of the heading. Keep whatever distinguishes this section from another in `heading`, since that is what someone navigating by heading hears.

### Slots

The section component supports slots for additional content placement within the component. Learn more about [using slots](https://shopify.dev/docs/api/polaris/using-polaris-web-components#slots).

* **accessory**

  **HTMLElement**

  Additional contextual information that qualifies the heading, rendered inline beside the heading text.

  Only accepts Badge, Icon, Button, Menu, Text, Avatar, Thumbnail, and Tooltip elements. Text must use `tone`, `fontSize`, and `fontWeight` of `auto`; Icon, Avatar, and Thumbnail must use `size="base"`; Badge must use `size="base"` and `color="base"`; Button must use `inlineSize="auto"`.

  A Tooltip an accessory element's `interestFor` points at can be slotted here beside it.

* **children**

  **HTMLElement**

  The content displayed within the section component, which groups related elements together in a logical unit with an optional heading.

* **graphic**

  **HTMLElement**

  A decorative visual that reinforces the heading, rendered before it.

  Accepts a single Icon with a `size` of `base`, or an icon-only Badge (`icon` set, no text content) with a `size` of `large`. The heading identifies the section, so this content is not announced by assistive technologies, and it is not rendered at all when the section has no `heading`.

* **primary-action**

  **HTMLElement**

  The primary action button or link, representing the main or most important action available in this context. Typically displayed with higher visual prominence than secondary actions to establish clear hierarchy.

* **secondary-actions**

  **HTMLElement**

  Additional action buttons or links that provide alternative or supporting actions. Visually de-emphasized compared to the primary action.

  A ButtonGroup holding an action and the icon-only activator for its Menu renders as one segmented group with a chevron activator. The group needs an `accessibilityLabel`, and must hold exactly one Button with text followed by one Button with no text that has an `accessibilityLabel` and a `commandFor` opening a Menu, both with a `variant` of `secondary` or `auto`.

* **supplemental**

  **HTMLElement**

  Status or metadata that describes the section as a whole rather than qualifying its heading, rendered at the inline-end of the header before any actions.

  This is not an action. Only accepts Badge, Avatar, Text, Icon, Thumbnail, and Tooltip elements, under the same prop constraints as `accessory`.

***

## Examples

### Add a content section with a heading

Create a section with a heading to group related content. This example shows a basic section with a title and description text.

## html

```html
<s-section heading="Online store dashboard">
  <s-paragraph>View a summary of your online store’s performance.</s-paragraph>
</s-section>
```

### Group form fields in a section

Use a section with a heading and form fields to group related inputs. This example shows a customer information form with text and email fields inside a top-level section.

## html

```html
<!-- Level 1 section - elevated with shadow on desktop -->
<s-section heading="Customer information">
  <s-text-field label="First name" value="John"></s-text-field>
  <s-text-field label="Last name" value="Doe"></s-text-field>
  <s-email-field label="Email" value="john@example.com"></s-email-field>
</s-section>
```

### Nest sections to group related content

Nest sections to group related content under a heading that describes it. Heading levels follow nesting depth automatically: the top-level heading is an `h2`, the one nested inside it an `h3`, and the next an `h4`. Nesting is a semantic structure, not a visual one, so a nested section doesn't draw its own card.

## html

```html
<s-stack gap="base">
  <!-- Top-level section: its heading is an h2 -->
  <s-section heading="Order details">
    <s-paragraph>Order #1234 placed on January 15, 2024</s-paragraph>


    <!-- Nested one level: heading becomes an h3 -->
    <s-section heading="Customer">
      <s-text-field label="Name" value="Jane Smith"></s-text-field>
      <s-text-field label="Email" value="jane@example.com"></s-text-field>


      <!-- Nested two levels: heading becomes an h4 -->
      <s-section heading="Billing address">
        <s-text-field label="Street" value="123 Main St"></s-text-field>
        <s-text-field label="City" value="Toronto"></s-text-field>
      </s-section>
    </s-section>


    <!-- Back to one level of nesting: an h3 again -->
    <s-section heading="Items">
      <s-paragraph>2 items totaling $49.99</s-paragraph>
    </s-section>
  </s-section>
</s-stack>
```

### Add an accessibility label for screen readers

Use the `accessibilityLabel` property to provide screen readers with additional context beyond the visible heading. This example shows a payment summary section and a label describing the contents of the section.

## html

```html
<s-section
  heading="Payment summary"
  accessibilityLabel="Order payment breakdown and totals"
>
  <s-stack gap="base">
    <s-paragraph>Subtotal: $42.99</s-paragraph>
    <s-paragraph>Tax: $5.59</s-paragraph>
    <s-paragraph>Shipping: $1.41</s-paragraph>
    <s-paragraph>
      <s-text type="strong">Total: $49.99</s-text>
    </s-paragraph>
  </s-stack>
</s-section>
```

### Remove padding for full-width content

Set the `padding` property to `none` so that content like tables can extend to the section edges. This example shows a product table rendered full-width within a section.

## html

```html
<s-section padding="none">
  <s-table>
    <s-table-header-row>
      <s-table-header listSlot="primary">Product</s-table-header>
      <s-table-header listSlot="labeled">Price</s-table-header>
      <s-table-header listSlot="inline">Status</s-table-header>
    </s-table-header-row>
    <s-table-body>
      <s-table-row>
        <s-table-cell>Cotton t-shirt</s-table-cell>
        <s-table-cell>$29.99</s-table-cell>
        <s-table-cell><s-badge tone="success">Active</s-badge></s-table-cell>
      </s-table-row>
    </s-table-body>
  </s-table>
</s-section>
```

### Add actions to a section header

Use the `primary-action` slot for one button with `variant="primary"`, and the `secondary-actions` slot for supporting buttons. A section header shows two actions inline at most, either a primary action with one secondary action or two secondary actions, and rolls the rest into a generated **More actions** menu.

## html

```html
<s-section heading="Shipping labels">
  <s-button slot="primary-action" variant="primary">Buy labels</s-button>
  <s-button slot="secondary-actions">Print</s-button>


  <s-paragraph>3 orders are ready to ship.</s-paragraph>
</s-section>
```

### Qualify a heading with accessory content

Use the `accessory` slot for content that qualifies the heading, such as a count or an explanation. The slot renders inline after the heading text and accepts badge, icon, button, menu, text, avatar, thumbnail, and tooltip elements. This example pairs a count badge with an icon-only button that opens a tooltip slotted beside it.

## html

```html
<s-section heading="Tracked shipments">
  <s-badge slot="accessory">12</s-badge>
  <s-button
    slot="accessory"
    variant="tertiary"
    icon="info"
    accessibilityLabel="About tracked shipments"
    interestFor="tracked-shipments-tooltip"
  ></s-button>
  <s-tooltip slot="accessory" id="tracked-shipments-tooltip">
    Shipments with a carrier tracking number from the last 30 days.
  </s-tooltip>


  <s-paragraph>Every shipment is on schedule.</s-paragraph>
</s-section>
```

### Show section status with supplemental content

Use the `supplemental` slot to report the state of the section as a whole. It renders at the inline-end of the header, before any actions, and accepts badge, avatar, text, icon, and thumbnail elements. It reports state rather than offering an action, so unlike `accessory` it takes no buttons or menus. Slotted text and icons can still point at a tooltip with `interestFor`.

## html

```html
<s-stack gap="base">
  <s-section heading="Carrier account">
    <s-badge slot="supplemental" tone="success">Connected</s-badge>


    <s-paragraph>Live rates from your carrier appear at checkout.</s-paragraph>
  </s-section>


  <s-section heading="Label queue">
    <s-text slot="supplemental" color="subdued">Updated 5 minutes ago</s-text>


    <s-paragraph>4 labels are waiting to be printed.</s-paragraph>
  </s-section>
</s-stack>
```

### Reinforce a heading with a graphic

Use the `graphic` slot for a decorative visual that reinforces the heading. It accepts one icon with `size="base"`, or one badge with `size="large"` that carries an `icon` and no text. Assistive technologies skip the graphic, and a section without a `heading` doesn't render it at all.

## html

```html
<s-stack gap="base">
  <s-section heading="In transit">
    <s-icon slot="graphic" type="delivery"></s-icon>


    <s-paragraph>Arriving Thursday, September 17.</s-paragraph>
  </s-section>


  <s-section heading="Delivered">
    <s-badge slot="graphic" icon="check" tone="success" size="large"></s-badge>


    <s-paragraph>Signed for on September 12.</s-paragraph>
  </s-section>
</s-stack>
```

### Combine the header slots

Header slots combine. This example uses all five: a graphic before the heading, accessory content after the heading text, supplemental status at the inline-end, and a primary action with one secondary action.

## html

```html
<s-section
  heading="Fulfillment"
  subheading="One item is still waiting to be fulfilled from your Toronto warehouse."
>
  <s-badge slot="graphic" icon="package" tone="warning" size="large"></s-badge>
  <s-text slot="accessory" color="subdued">#1001-F1</s-text>
  <s-badge slot="supplemental" tone="warning">Partially fulfilled</s-badge>
  <s-button slot="primary-action" variant="primary">Fulfill items</s-button>
  <s-button slot="secondary-actions">Print packing slip</s-button>


  <s-paragraph>1 of 2 items fulfilled.</s-paragraph>
</s-section>
```

***

## Best practices

* **Use to group related content:** The component provides semantic structure and a visual container for grouping related content. Each section should contain a cohesive set of information or controls that belong together.
* **Provide meaningful headings:** Section headings help merchants scan and navigate content. Write headings that clearly describe what's in the section rather than using vague labels.
* **Nest thoughtfully:** Nesting adjusts heading levels, so it structures the document outline rather than the visuals. Excessive nesting creates overly complex structures, so limit it to 2-3 levels where the hierarchy is meaningful and helps merchants understand the content organization.
* **Consider when to remove padding:** Full-width content like tables or images might need to extend to section edges. Remove padding when the content design requires it, but ensure nested content within has appropriate spacing.
* **Use accessibility labels when needed:** When the visible heading doesn't fully convey the section's purpose to screen reader users, provide an accessibility label with additional context.
* **Choose between accessory and supplemental:** Put content that qualifies the heading, like a count or a tooltip, in `accessory`. Put the state of the whole section, like a status badge, in `supplemental`. Only `accessory` takes an action, such as a button or a menu.
* **Keep header actions short:** A section header shows two actions inline at most, and rolls the rest into a generated menu. Give an icon-only action an `accessibilityLabel`, which also becomes its tooltip and its menu item text once it rolls up.
* **Keep the graphic decorative:** Assistive technologies skip the `graphic` slot, so anything a merchant needs to read belongs in the `heading` or `subheading` property, or in the `supplemental` slot.

***

## Limitations

* The component doesn't include expand/collapse functionality. If you need collapsible sections, you'll need to implement this using additional state management and accessibility attributes.
* Section headings automatically increment their semantic level based on nesting depth, but they stop at h4 for deeply nested sections. Content nested beyond three levels might have less clear document structure.

***
