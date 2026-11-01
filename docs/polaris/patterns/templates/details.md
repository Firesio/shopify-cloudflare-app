---
title: Details
description: >-
  From the index, merchants need to edit and view individual resources. For
  React Router-based Shopify apps, a resource type's details route file will use
  the pattern app.[resource].$id.jsx.
api_version: v2.0
source_url:
  html: 'https://shopify.dev/docs/api/app-home/latest/patterns/templates/details'
  md: 'https://shopify.dev/docs/api/app-home/latest/patterns/templates/details.md'
api_name: app-home
---

# Details

From the index, merchants need to edit and view individual resources. For React Router-based Shopify apps, a resource type's details route file will use the pattern `app.[resource].$id.jsx`. For example, `app.product.$id.jsx` for managing a single product through your app.

The details template provides an efficient dual-column layout that puts editable content front and center while keeping supporting information visible in the sidebar. Use the primary column for information that defines the resource. Use the secondary column for supporting information such as status, metadata, and summaries. Provide breadcrumb navigation so merchants can return to the previous page without using the browser back button.

Group the page into [sections](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section), and put anything that describes or acts on a whole section in its header rather than its body. Name each section with [`heading`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#section-propertydetail-heading), and add supporting text with [`subheading`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#section-propertydetail-subheading). Use the [`accessory`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#sectionslots-propertydetail-accessory) slot for details that qualify the heading, such as a count. Use the [`supplemental`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#sectionslots-propertydetail-supplemental) slot for the section's status, and the [`primary-action`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#sectionslots-propertydetail-primaryaction) and [`secondary-actions`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#sectionslots-propertydetail-secondaryactions) slots for its actions. When a section holds a [table](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table), set [`padding="none"`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#section-propertydetail-padding) so that the table reaches the section's edges.

The details pattern follows proven design guidelines that help your app feel native to the Shopify admin. See [Built for Shopify requirements](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements) for more details on these guidelines.

### Related Components (25) APIs (2) Compositions (2)

### Supported components

* [Badge](https://shopify.dev/docs/api/app-home/v2.0/web-components/feedback-and-status-indicators/badge)
* [Banner](https://shopify.dev/docs/api/app-home/v2.0/web-components/feedback-and-status-indicators/banner)
* [Box](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/box)
* [Button](https://shopify.dev/docs/api/app-home/v2.0/web-components/actions/button)
* [Divider](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/divider)
* [Grid](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/grid)
* [Heading](https://shopify.dev/docs/api/app-home/v2.0/web-components/typography-and-content/heading)
* [Icon](https://shopify.dev/docs/api/app-home/v2.0/web-components/media-and-visuals/icon)
* [Image](https://shopify.dev/docs/api/app-home/v2.0/web-components/media-and-visuals/image)
* [Link](https://shopify.dev/docs/api/app-home/v2.0/web-components/actions/link)
* [Modal](https://shopify.dev/docs/api/app-home/v2.0/web-components/overlays/modal)
* [Money field](https://shopify.dev/docs/api/app-home/v2.0/web-components/forms/money-field)
* [Number field](https://shopify.dev/docs/api/app-home/v2.0/web-components/forms/number-field)
* [Search field](https://shopify.dev/docs/api/app-home/v2.0/web-components/forms/search-field)
* [Section](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/section)
* [Select](https://shopify.dev/docs/api/app-home/v2.0/web-components/forms/select)
* [Stack](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/stack)
* [Switch](https://shopify.dev/docs/api/app-home/v2.0/web-components/forms/switch)
* [Table](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/table)
* [Text](https://shopify.dev/docs/api/app-home/v2.0/web-components/typography-and-content/text)
* [Text area](https://shopify.dev/docs/api/app-home/v2.0/web-components/forms/text-area)
* [Text field](https://shopify.dev/docs/api/app-home/v2.0/web-components/forms/text-field)
* [Thumbnail](https://shopify.dev/docs/api/app-home/v2.0/web-components/media-and-visuals/thumbnail)
* [Unordered list](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/unordered-list)
* [Urlfield](https://shopify.dev/docs/api/app-home/v2.0/web-components/forms/url-field)

### Available APIs

* [Modal API](https://shopify.dev/docs/api/app-home/v2.0/apis/user-interface-and-interactions/modal-api)
* [Save Bar API](https://shopify.dev/docs/api/app-home/v2.0/apis/user-interface-and-interactions/save-bar-api)

### Recommended compositions

* [Footer help](https://shopify.dev/docs/api/app-home/v2.0/patterns/compositions/footer-help)
* [Resource list](https://shopify.dev/docs/api/app-home/v2.0/patterns/compositions/resource-list)

#### Use cases

* Creating, viewing, or editing individual resource objects
* Any form-heavy page where merchants need to see status or context while editing
* Pages that require a save/discard workflow

***

## Examples

### Present a product details view with editable fields and sidebar

Merchants need to edit and view a single resource with supporting info in the sidebar. This example presents a puzzle details view with editable fields in the main column, and a summary and notes in the sidebar. The templates section shows its count in the `accessory` slot and its **Browse templates** action in the `secondary-actions` slot, and uses `padding="none"` so that its table spans the section. The count comes from the same data that renders the table's rows, so it stays accurate as templates are added or removed. The summary reports the puzzle's status in the `supplemental` slot, and the notes section's edit action is an icon-only [button](https://shopify.dev/docs/api/app-home/latest/web-components/actions/button) with an [`accessibilityLabel`](https://shopify.dev/docs/api/app-home/latest/web-components/actions/button#button-propertydetail-accessibilitylabel) that names it for screen readers.

##### jsx

```tsx
const templates = [
  {id: '16-pieces', name: '16-pieces puzzle', image: 'https://cdn.shopify.com/static/images/polaris/patterns/16-pieces.png'},
  {id: '9-pieces', name: '9-pieces puzzle', image: 'https://cdn.shopify.com/static/images/polaris/patterns/9-pieces.png'},
];

return (
  <form>
    <s-page heading="Mountain view">
      <s-link slot="breadcrumb-actions" href="/app/puzzles">
        Puzzles
      </s-link>
      <s-button slot="secondary-actions">Duplicate</s-button>
      <s-button slot="secondary-actions" tone="critical">Delete</s-button>

      {/* === */}
      {/* Puzzle information */}
      {/* === */}
      <s-section heading="Puzzle information">
        <s-text-field
          label="Puzzle name"
          name="name"
          placeholder="Enter puzzle name"
          value="Mountain view"
          details="Players will see this name when browsing puzzles."
        />
        <s-text-area
          label="Description"
          name="description"
          placeholder="Brief description of your puzzle"
          value="A beautiful mountain landscape puzzle"
          details="Help players understand what your puzzle features"
        />
        <s-money-field
          label="Price"
          name="price"
          placeholder="0.00"
          value="9.99"
          details="Set the price for this puzzle"
        />
        <s-url-field
          label="Reference image URL"
          name="reference-image-url"
          placeholder="https://example.com/image.jpg"
          details="Optional link to original image"
        />
      </s-section>

      {/* === */}
      {/* Puzzle templates */}
      {/* Header slots hold the count and the action, and padding="none" lets the table reach the section edges. The count comes from the same data as the rows, so it stays in step as templates are added. */}
      {/* === */}
      <s-section heading="Puzzle templates" padding="none">
        <s-badge slot="accessory">{templates.length}</s-badge>
        <s-button slot="secondary-actions">Browse templates</s-button>
        <s-table>
          <s-search-field
            slot="filters"
            label="Search templates"
            labelAccessibilityVisibility="exclusive"
            placeholder="Search templates"
          />
          <s-table-header-row>
            <s-table-header listSlot="primary">Template</s-table-header>
            <s-table-header listSlot="inline">
              <s-stack alignItems="end">Actions</s-stack>
            </s-table-header>
          </s-table-header-row>
          <s-table-body>
            {templates.map((template) => (
              <s-table-row key={template.id}>
                <s-table-cell>
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-thumbnail
                      size="small"
                      alt={`${template.name} template`}
                      src={template.image}
                    />
                    {template.name}
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  <s-stack
                    direction="inline"
                    gap="base"
                    alignItems="center"
                    justifyContent="end"
                  >
                    <s-link>Preview</s-link>
                    <s-button
                      icon="x"
                      tone="neutral"
                      variant="tertiary"
                      accessibilityLabel={`Remove ${template.name} template`}
                    />
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            ))}
            {/* Add templates to the array above to add rows */}
            {/* If more than 10 rows are needed, details page tables should use the paginate, hasPreviousPage, hasNextPage, onPreviousPage, and onNextPage attributes to display and handle pagination) */}
          </s-table-body>
        </s-table>
      </s-section>

      {/* === */}
      {/* Production settings */}
      {/* Use subheading for supporting text instead of a paragraph in the section body. */}
      {/* === */}
      <s-section
        heading="Production settings"
        subheading="These settings apply to every copy of this puzzle that you sell."
      >
        <s-select label="Puzzle size" name="puzzle-size">
          <s-option value="small">Small (9" x 9")</s-option>
          <s-option value="medium" selected>
            Medium (18" x 24")
          </s-option>
          <s-option value="large">Large (24" x 36")</s-option>
        </s-select>
        <s-select label="Piece count" name="piece-count">
          <s-option value="250">250 pieces (Easy)</s-option>
          <s-option value="500" selected>
            500 pieces (Medium)
          </s-option>
          <s-option value="1000">1000 pieces (Hard)</s-option>
          <s-option value="2000">2000 pieces (Expert)</s-option>
        </s-select>
        <s-select label="Material" name="material">
          <s-option value="standard" selected>
            Standard cardboard
          </s-option>
          <s-option value="premium">Premium cardboard</s-option>
          <s-option value="wooden">Wooden pieces</s-option>
        </s-select>
        <s-number-field
          label="Quantity in stock"
          name="quantity-in-stock"
          value="50"
          min={0}
          placeholder="0"
          details="Current inventory quantity"
        />
        <s-switch
          label="Include reference image"
          name="include-reference-image"
          details="Ship a reference image with the puzzle"
        />
      </s-section>

      {/* === */}
      {/* Puzzle summary */}
      {/* Sections in the aside slot render as a sidebar. Report the resource's status in the supplemental slot. */}
      {/* === */}
      <s-section slot="aside" heading="Puzzle summary">
        <s-badge slot="supplemental" tone="success">
          Active
        </s-badge>
        <s-unordered-list>
          <s-list-item>16-piece puzzle with medium difficulty</s-list-item>
          <s-list-item>Pieces can be rotated</s-list-item>
          <s-list-item>No time limit</s-list-item>
        </s-unordered-list>
      </s-section>

      {/* === */}
      {/* Notes */}
      {/* An icon-only action needs an accessibilityLabel so that screen readers can name it. */}
      {/* === */}
      <s-section slot="aside" heading="Notes">
        <s-button
          slot="secondary-actions"
          variant="tertiary"
          icon="edit"
          accessibilityLabel="Edit notes"
        />
        <s-paragraph color="subdued">
          Popular with players who enjoy landscape puzzles.
        </s-paragraph>
      </s-section>

      {/* Footer help */}
      <s-stack alignItems="center" paddingBlock="large">
        <s-text color="subdued">
          Learn more about <s-link href="https://help.shopify.com" target="_blank">puzzle best practices</s-link>.
        </s-text>
      </s-stack>
    </s-page>
  </form>
);
```

##### html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.shopify.com/shopifycloud/polaris-2.0.js"></script>
    <title>Pattern</title>
  </head>
  <body>
    <!-- === -->
    <!-- Details page pattern -->
    <!-- === -->
    <form>
      <s-page heading="Mountain view">
        <s-link slot="breadcrumb-actions" href="/app/puzzles">Puzzles</s-link>
        <s-button slot="secondary-actions">Duplicate</s-button>
        <s-button slot="secondary-actions" tone="critical">Delete</s-button>

        <!-- === -->
        <!-- Puzzle information -->
        <!-- === -->
        <s-section heading="Puzzle information">
          <s-text-field
            label="Puzzle name"
            name="name"
            placeholder="Enter puzzle name"
            value="Mountain view"
            details="Players will see this name when browsing puzzles."
          ></s-text-field>
          <s-text-area
            label="Description"
            name="description"
            placeholder="Brief description of your puzzle"
            value="A beautiful mountain landscape puzzle"
            details="Help players understand what your puzzle features"
          ></s-text-area>
          <s-money-field
            label="Price"
            name="price"
            placeholder="0.00"
            value="9.99"
            details="Set the price for this puzzle"
          ></s-money-field>
          <s-url-field
            label="Reference image URL"
            name="reference-image-url"
            placeholder="https://example.com/image.jpg"
            details="Optional link to original image"
          ></s-url-field>
        </s-section>

        <!-- === -->
        <!-- Puzzle templates -->
        <!-- Header slots hold the count and the action, and padding="none" lets the table reach the section edges. Keep the count equal to the number of rows the table lists. -->
        <!-- === -->
        <s-section heading="Puzzle templates" padding="none">
          <s-badge slot="accessory">2</s-badge>
          <s-button slot="secondary-actions">Browse templates</s-button>
          <s-table>
            <s-search-field
              slot="filters"
              label="Search templates"
              labelAccessibilityVisibility="exclusive"
              placeholder="Search templates"
            ></s-search-field>
            <s-table-header-row>
              <s-table-header listSlot="primary">Template</s-table-header>
              <s-table-header listSlot="inline">
                <s-stack alignItems="end">Actions</s-stack>
              </s-table-header>
            </s-table-header-row>
            <s-table-body>
              <s-table-row>
                <s-table-cell>
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-thumbnail
                      size="small"
                      alt="16-pieces puzzle template"
                      src="https://cdn.shopify.com/static/images/polaris/patterns/16-pieces.png"
                    ></s-thumbnail>
                    16-pieces puzzle
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  <s-stack
                    direction="inline"
                    gap="base"
                    alignItems="center"
                    justifyContent="end"
                  >
                    <s-link>Preview</s-link>
                    <s-button
                      icon="x"
                      tone="neutral"
                      variant="tertiary"
                      accessibilityLabel="Remove 16-pieces puzzle template"
                    ></s-button>
                  </s-stack>
                </s-table-cell>
              </s-table-row>
              <s-table-row>
                <s-table-cell>
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-thumbnail
                      size="small"
                      alt="9-pieces puzzle template"
                      src="https://cdn.shopify.com/static/images/polaris/patterns/9-pieces.png"
                    ></s-thumbnail>
                    9-pieces puzzle
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  <s-stack
                    direction="inline"
                    gap="base"
                    alignItems="center"
                    justifyContent="end"
                  >
                    <s-link>Preview</s-link>
                    <s-button
                      icon="x"
                      tone="neutral"
                      variant="tertiary"
                      accessibilityLabel="Remove 9-pieces puzzle template"
                    ></s-button>
                  </s-stack>
                </s-table-cell>
              </s-table-row>
              <!-- Add more rows as needed here -->
              <!-- If more than 10 rows are needed, details page tables should use the paginate, hasPreviousPage, hasNextPage, onPreviousPage, and onNextPage attributes to display and handle pagination) -->
            </s-table-body>
          </s-table>
        </s-section>

        <!-- === -->
        <!-- Production settings -->
        <!-- Use subheading for supporting text instead of a paragraph in the section body. -->
        <!-- === -->
        <s-section
          heading="Production settings"
          subheading="These settings apply to every copy of this puzzle that you sell."
        >
          <s-select label="Puzzle size" name="puzzle-size">
            <s-option value="small">Small (9" x 9")</s-option>
            <s-option value="medium" selected>Medium (18" x 24")</s-option>
            <s-option value="large">Large (24" x 36")</s-option>
          </s-select>
          <s-select label="Piece count" name="piece-count">
            <s-option value="250">250 pieces (Easy)</s-option>
            <s-option value="500" selected>500 pieces (Medium)</s-option>
            <s-option value="1000">1000 pieces (Hard)</s-option>
            <s-option value="2000">2000 pieces (Expert)</s-option>
          </s-select>
          <s-select label="Material" name="material">
            <s-option value="standard" selected>Standard cardboard</s-option>
            <s-option value="premium">Premium cardboard</s-option>
            <s-option value="wooden">Wooden pieces</s-option>
          </s-select>
          <s-number-field
            label="Quantity in stock"
            name="quantity-in-stock"
            value="50"
            min="0"
            placeholder="0"
            details="Current inventory quantity"
          ></s-number-field>
          <s-switch
            label="Include reference image"
            name="include-reference-image"
            details="Ship a reference image with the puzzle"
          ></s-switch>
        </s-section>

        <!-- === -->
        <!-- Puzzle summary -->
        <!-- Sections in the aside slot render as a sidebar. Report the resource's status in the supplemental slot. -->
        <!-- === -->
        <s-section slot="aside" heading="Puzzle summary">
          <s-badge slot="supplemental" tone="success">Active</s-badge>
          <s-unordered-list>
            <s-list-item>16-piece puzzle with medium difficulty</s-list-item>
            <s-list-item>Pieces can be rotated</s-list-item>
            <s-list-item>No time limit</s-list-item>
          </s-unordered-list>
        </s-section>

        <!-- === -->
        <!-- Notes -->
        <!-- An icon-only action needs an accessibilityLabel so that screen readers can name it. -->
        <!-- === -->
        <s-section slot="aside" heading="Notes">
          <s-button
            slot="secondary-actions"
            variant="tertiary"
            icon="edit"
            accessibilityLabel="Edit notes"
          ></s-button>
          <s-paragraph color="subdued">
            Popular with players who enjoy landscape puzzles.
          </s-paragraph>
        </s-section>

        <!-- Footer help -->
        <s-stack alignItems="center" paddingBlock="large">
          <s-text color="subdued">Learn more about <s-link href="https://help.shopify.com" target="_blank">puzzle best practices</s-link>.</s-text>
        </s-stack>
      </s-page>
    </form>
  </body>
</html>
```

### Confirm destructive actions with Modal API

Use the [Modal API](https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/modal-api) to confirm destructive actions like deleting a resource. The modal prevents accidental data loss by requiring explicit confirmation.

##### jsx

```tsx
<s-grid justifyItems="center" alignItems="center" minBlockSize="200px">
  <s-button
    tone="critical"
    commandFor="delete-modal"
    command="--show"
  >
    Delete
  </s-button>

  <s-modal id="delete-modal" heading="Delete product?">
    <s-stack direction="block" gap="base">
      <s-text>
        Are you sure you want to delete this product? This action cannot be undone.
      </s-text>
      <s-banner tone="warning">
        <s-text>
          This will permanently remove the product and all associated data.
        </s-text>
      </s-banner>
    </s-stack>
    <s-button
      slot="primary-action"
      variant="primary"
      tone="critical"
      onClick={() => {
        console.log("Product deleted");
      }}
    >
      Delete
    </s-button>
    <s-button
      slot="secondary-actions"
      commandFor="delete-modal"
      command="--hide"
    >
      Cancel
    </s-button>
  </s-modal>
</s-grid>
```

##### html

```html
<s-grid justifyItems="center" alignItems="center" minBlockSize="200px">
  <s-button
    tone="critical"
    commandFor="delete-modal"
    command="--show"
  >
    Delete
  </s-button>

  <s-modal id="delete-modal" heading="Delete product?">
    <s-stack direction="block" gap="base">
      <s-text>
        Are you sure you want to delete this product? This action cannot be undone.
      </s-text>
      <s-banner tone="warning">
        <s-text>
          This will permanently remove the product and all associated data.
        </s-text>
      </s-banner>
    </s-stack>
    <s-button
      slot="primary-action"
      variant="primary"
      tone="critical"
    >
      Delete
    </s-button>
    <s-button
      slot="secondary-actions"
      commandFor="delete-modal"
      command="--hide"
    >
      Cancel
    </s-button>
  </s-modal>
</s-grid>
```

### Retain unsaved changes with Save Bar

Add `data-save-bar` to your form element to enable the [Save Bar API](https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/save-bar-api), which displays save/discard controls when the form has unsaved changes.

##### jsx

```tsx
// @validate-ignore: Argument of type 'EventTarget | null' is not assignable to parameter of type 'HTMLFormElement | undefined', Type 'null' is not assignable to type 'HTMLFormElement | undefined', Argument of type 'FormData' is not assignable to parameter of type 'Iterable'
<form
  data-save-bar
  onSubmit={(event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const formEntries = Object.fromEntries(formData);
    console.log("Form submitted", formEntries);
  }}
  onReset={(event) => {
    console.log("Changes discarded");
  }}
>
  <s-section heading="Basic information">
    <s-text-field
      label="Title"
      name="title"
      value="Premium Cotton T-Shirt"
      details="Minimum 10 characters recommended"
    />
    <s-text-area
      label="Description"
      name="description"
      value="Our premium cotton t-shirt is made from 100% organic cotton."
      rows={4}
    />
  </s-section>
</form>
```

##### html

```html
<!-- Save Bar integration - wrap forms with data-save-bar attribute -->
<form data-save-bar>
  <s-section heading="Basic information">
    <s-text-field
      label="Title"
      name="title"
      value="Premium Cotton T-Shirt"
      details="Minimum 10 characters recommended"
    ></s-text-field>
    <s-text-area
      label="Description"
      name="description"
      value="Our premium cotton t-shirt is made from 100% organic cotton."
      rows="4"
    ></s-text-area>
  </s-section>
</form>
```

***
