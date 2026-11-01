---
title: Empty state
description: >-
  The empty state component tells merchants why a page, list, or table has
  nothing to display and what action they need to take. It centers a heading, an
  optional graphic and subheading, and up to two actions.
api_version: v2.0
source_url:
  html: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/empty-state
  md: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/empty-state.md
api_name: app-home
---

# Empty state

The empty state component tells merchants why a page, list, or table has nothing to display and what action they need to take. It centers a heading, an optional graphic and subheading, and up to two actions.

Place an empty state anywhere a resource can be blank. Inside a [table](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table) body, it takes over from the rows and spans every column. For messages about a state that isn't empty, use [banner](https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/banner).

#### Use cases

* **Empty lists:** Explain why a list has no items yet and offer the action that creates the first one.
* **Empty tables:** Replace table rows with a message when a query returns nothing.
* **Unconfigured features:** Prompt merchants to finish setup before a feature has data to show.
* **Filtered results:** Tell merchants that a filter or search matched nothing, and offer a way to change it.

```html
<s-empty-state heading="Add your first product">
  <s-icon slot="graphic" type="product"></s-icon>
  <s-text slot="subheading">Products you add here are ready to sell across your sales channels.</s-text>
  <s-button slot="primary-action" variant="primary">Add product</s-button>
</s-empty-state>
```

***

## Properties

Configure the following properties on the empty state component.

* **heading**

  **string**

  The heading of the EmptyState.

### Slots

The empty state component supports slots for additional content placement within the component. Learn more about [using slots](https://shopify.dev/docs/api/polaris/using-polaris-web-components#slots).

* **graphic**

  **HTMLElement**

  An illustration or symbol shown above the heading. Accepts a single `Image` or `Icon`, either directly or as the only child of a wrapping element.

* **primary-action**

  **HTMLElement**

  The main call to action, rendered below the text content. Accepts a single `Button` with a `variant` of `primary`; anything else is ignored with a development warning.

* **secondary-actions**

  **HTMLElement**

  An alternative action, rendered beside the primary one. Accepts a single `Button` with a `variant` of `secondary` or `auto` — despite the plural name, only one is rendered.

* **subheading**

  **HTMLElement**

  Supporting text below the heading, explaining what's missing or what to do next. Accepts `Text` and `Link` components.

***

## Examples

### Explain an empty list and offer the first action

Pair the `heading` property with the `subheading` and `primary-action` slots so merchants know both why the page is empty and what to do next. The `graphic` slot takes a single [icon](https://shopify.dev/docs/api/app-home/latest/web-components/media-and-visuals/icon) or [image](https://shopify.dev/docs/api/app-home/latest/web-components/media-and-visuals/image).

## html

```html
<s-empty-state heading="Add your first product">
  <s-icon slot="graphic" type="product"></s-icon>
  <s-text slot="subheading">Products you add here are ready to sell across your sales channels.</s-text>
  <s-button slot="primary-action" variant="primary">Add product</s-button>
</s-empty-state>
```

### Offer more than one way forward

Use the `secondary-actions` slot for an alternative to the primary action. Each slot requires a matching button variant: `primary-action` takes a button with `variant="primary"`, and `secondary-actions` takes one with `variant="secondary"` or `variant="auto"`. A button with any other variant is dropped with a console warning.

## html

```html
<s-empty-state heading="No customers yet">
  <s-text slot="subheading">Import a customer list, or wait for customers to place their first order.</s-text>
  <s-button slot="secondary-actions" variant="secondary">Import customers</s-button>
  <s-button slot="primary-action" variant="primary">Add customer</s-button>
</s-empty-state>
```

### Show an empty state inside a table

Put an empty state directly in a [table](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table) body. It renders only when the body has no rows and the table isn't loading, and it spans every column, so you can leave it in place and let the table switch between rows and the empty state on its own.

## html

```html
<s-section padding="none">
  <s-table>
    <s-table-header-row>
      <s-table-header>Name</s-table-header>
      <s-table-header>Email</s-table-header>
      <s-table-header format="numeric">Orders placed</s-table-header>
    </s-table-header-row>
    <s-table-body>
      <s-empty-state heading="No customers match those filters">
        <s-icon slot="graphic" type="search"></s-icon>
        <s-text slot="subheading">Try changing the filters or the search term.</s-text>
      </s-empty-state>
    </s-table-body>
  </s-table>
</s-section>
```

***

## Best practices

* **Say why it's empty, then what to do:** A heading that says only "No products" leaves merchants guessing. Name the cause in the heading and put the next step in the action.
* **Offer one clear primary action:** Put the action that resolves the empty state in `primary-action`, and keep the alternative in `secondary-actions`.
* **Distinguish empty from filtered:** An empty resource and a filter that matched nothing need different wording. For a filtered result, tell merchants how to change the filter.
* **Treat the graphic as optional:** The heading and action carry the meaning. Skip the graphic in dense contexts, and keep it to a single icon or image when you use one.

***

## Limitations

* Outside a table, the component doesn't detect emptiness. Render it conditionally when your data set is empty. Inside a [table](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table) body, the table handles that for you.
* `heading` is a plain string, so it can't contain inline markup. Use the `subheading` slot for content that needs links or emphasis.
* The slots accept only specific children: one [icon](https://shopify.dev/docs/api/app-home/latest/web-components/media-and-visuals/icon) or [image](https://shopify.dev/docs/api/app-home/latest/web-components/media-and-visuals/image) in `graphic`, [text](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/text) and [link](https://shopify.dev/docs/api/app-home/latest/web-components/actions/link) in `subheading`, and a single [button](https://shopify.dev/docs/api/app-home/latest/web-components/actions/button) in each action slot. Anything else is dropped with a console warning. Despite the plural name, `secondary-actions` holds one button.
* The component has no tones or variants. For status messaging that isn't about absent content, use [banner](https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/banner).

***
