---
title: Search field
description: >-
  The search field component captures search terms for filtering and search
  functionality. Use it to enable inline search within specific sections or
  lists, like filtering products or searching customers.
api_version: v2.0
source_url:
  html: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/search-field
  md: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/search-field.md
api_name: app-home
---

# Search field

The search field component captures search terms for filtering and search functionality. Use it to enable inline search within specific sections or lists, like filtering products or searching customers. For general text input, use [text field](https://shopify.dev/docs/api/app-home/latest/web-components/forms/text-field).

#### Use cases

* **Inline search:** Enable search within specific sections or data sets.
* **Filter input:** Provide search input for filtering lists or tables in real-time.
* **Quick find:** Implement quick find functionality for products, customers, or orders.
* **Contextual search:** Create search fields scoped to specific contexts or resources.

```html
<s-search-field label="Search products" placeholder="Search by name"></s-search-field>
```

***

## Search​Field

Configure the following properties on the search field component.

* **autocomplete**

  **"on" | "off" | TextAutocompleteField | \`section-${string} one-time-code\` | "shipping one-time-code" | "billing one-time-code" | \`section-${string} shipping one-time-code\` | \`section-${string} billing one-time-code\` | \`section-${string} language\` | \`section-${string} organization\` | \`section-${string} additional-name...**

  **Default: 'on' for everything else**

  A hint as to the intended content of the field.

  When set to `on` (the default), this property indicates that the field should support autofill, but you do not have any more semantic information on the intended contents.

  When set to `off`, you are indicating that this field contains sensitive information, or contents that are never saved, like one-time codes.

  Alternatively, you can provide value which describes the specific data you would like to be entered into this field during autofill.

* **default​Value**

  **string**

  The initial value of the field when it first loads. Unlike `placeholder`, this is a real value that the user can edit and that gets submitted with the form. Once the user starts typing, their input replaces it. Changing this property after the field has loaded has no effect. To update the field value at any time, use `value` instead.

* **details**

  **ComponentChildren**

  Supplementary text displayed below the field to provide additional context, instructions, or help. Use this to clarify the expected input or provide guidance to users. This text is announced to screen readers.

* **disabled**

  **boolean**

  **Default: false**

  Whether the field is disabled, preventing any user interaction.

* **error**

  **ComponentChildren**

  An error message displayed below the field to indicate validation problems. When set, the field is styled with error indicators and the message is announced to screen readers.

* **id**

  **string**

  A unique identifier for the element. Use this to reference the element in JavaScript, link labels to form controls, or target specific elements for styling or scripting.

* **label**

  **ComponentChildren**

  The text displayed as the field label, which identifies the purpose of the field to users. This label is associated with the field for accessibility and helps users understand what information to provide.

* **label​Accessibility​Visibility**

  **"visible" | "exclusive"**

  **Default: 'visible'**

  Controls whether the label is visible to all users or only to screen readers.

  * `visible`: The label is shown to everyone (default).
  * `exclusive`: The label is visually hidden but still announced by screen readers.

  Use `exclusive` when the surrounding context makes the label redundant visually, but screen reader users still need it for clarity.

* **max​Length**

  **number**

  **Default: Infinity**

  The maximum number of characters allowed in the field.

* **min​Length**

  **number**

  **Default: 0**

  The minimum number of characters required in the field.

* **name**

  **string**

  The name attribute for the field, used to identify the field's value when the form is submitted. Must be unique within the nearest containing form.

* **placeholder**

  **string**

  The placeholder text displayed in the field when it's empty, providing a hint about the expected input format or value.

* **read​Only**

  **boolean**

  **Default: false**

  Whether the field is read-only and can't be edited. Read-only fields remain focusable and their content is announced by screen readers.

* **required**

  **boolean**

  **Default: false**

  Whether the field requires a value before form submission. Displays a visual indicator and adds semantic meaning, but doesn't automatically validate or show errors. Use the `error` property to display validation messages.

* **value**

  **string**

  The current value for the field. If omitted, the field will be empty.

### TextAutocompleteField

Represents autocomplete values that are valid for text input fields. This is a subset of \`AnyAutocompleteField\` containing only fields suitable for text-based inputs. Available values: - \`name\` - Full name - \`given-name\` - First name - \`additional-name\` - Middle name - \`family-name\` - Last name - \`nickname\` - Nickname or handle - \`username\` - Username for login - \`honorific-prefix\` - Name prefix (Mr., Mrs., Dr.) - \`honorific-suffix\` - Name suffix (Jr., Sr., III) - \`organization\` - Company or organization name - \`organization-title\` - Job title or position - \`address-line1\` - Street address (first line) - \`address-line2\` - Street address (second line) - \`address-line3\` - Street address (third line) - \`address-level1\` - State or province - \`address-level2\` - City or town - \`address-level3\` - District or locality - \`address-level4\` - Neighborhood or suburb - \`street-address\` - Complete street address (multi-line) - \`postal-code\` - Postal or ZIP code - \`country\` - Country code (US, CA, GB) - \`country-name\` - Country name (United States, Canada) - \`language\` - Preferred language - \`sex\` - Gender or sex - \`one-time-code\` - One-time codes for authentication - \`transaction-currency\` - Currency code (USD, EUR, GBP) - \`cc-name\` - Name on credit card - \`cc-given-name\` - First name on credit card - \`cc-additional-name\` - Middle name on credit card - \`cc-family-name\` - Last name on credit card - \`cc-type\` - Credit card type (Visa, Mastercard)

```ts
'language' | 'organization' | 'additional-name' | 'address-level1' | 'address-level2' | 'address-level3' | 'address-level4' | 'address-line1' | 'address-line2' | 'address-line3' | 'country-name' | 'country' | 'family-name' | 'given-name' | 'honorific-prefix' | 'honorific-suffix' | 'name' | 'nickname' | 'one-time-code' | 'organization-title' | 'postal-code' | 'sex' | 'street-address' | 'transaction-currency' | 'username' | 'cc-additional-name' | 'cc-family-name' | 'cc-given-name' | 'cc-name' | 'cc-type'
```

### ComponentChildren

Represents any valid children that can be rendered within a component, including elements, strings, numbers, or arrays of these types. This is an alias for Preact's \`ComponentChildren\` type.

```ts
preact.ComponentChildren
```

### Events

The search field component provides event callbacks for handling user interactions. Learn more about [handling events](https://shopify.dev/docs/api/polaris/using-polaris-web-components#handling-events).

* **blur**

  **CallbackEventListener<'input'>**

  A callback fired when the search field loses focus.

  Learn more about the [blur event](https://developer.mozilla.org/en-US/docs/Web/API/Element/blur_event).

* **change**

  **CallbackEventListener<'input'>**

  A callback fired when the search field value changes.

  Learn more about the [change event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/change_event).

* **focus**

  **CallbackEventListener<'input'>**

  A callback fired when the search field receives focus.

  Learn more about the [focus event](https://developer.mozilla.org/en-US/docs/Web/API/Element/focus_event).

* **input**

  **CallbackEventListener<'input'>**

  A callback fired when the user inputs data into the search field.

  Learn more about the [input event](https://developer.mozilla.org/en-US/docs/Web/API/Element/input_event).

### CallbackEventListener

A function that handles events from UI components. This type represents an event listener callback that receives a \`CallbackEvent\` with a strongly-typed \`currentTarget\`. Use this for component event handlers like \`click\`, \`focus\`, \`blur\`, and other DOM events.

```ts
(EventListener & {
      (event: CallbackEvent<T>): void;
    }) | null
```

### CallbackEvent

An event object with a strongly-typed \`currentTarget\` property that references the specific HTML element that triggered the event. This type extends the standard DOM \`Event\` interface and ensures type safety when accessing the element that fired the event.

```ts
Event & {
  currentTarget: HTMLElementTagNameMap[T];
}
```

***

## Examples

### Add a basic search field

Add a search input so merchants can find items quickly. This example shows a search field with a visually hidden label and placeholder text.

## html

```html
<s-search-field
  label="Search"
  labelAccessibilityVisibility="exclusive"
  placeholder="Search items"
></s-search-field>
```

### Show a search error

Display an error message when a search query is invalid or encounters a problem. This example shows a search field with a pre-filled query and a static error message.

## html

```html
<s-search-field
  label="Search orders"
  name="orderSearch"
  error="No results found"
  value="xyz123"
></s-search-field>
```

### Disable a search field

Disable a search field to prevent interaction when search is temporarily unavailable. This example shows a disabled search field with placeholder text explaining the state.

## html

```html
<s-search-field
  label="Search customers"
  name="customerSearch"
  disabled
  placeholder="Search is currently unavailable"
></s-search-field>
```

### Set character length limits

Set minimum and maximum character lengths to control the search query length. This example shows a search field that requires at least 3 characters and allows up to 50.

## html

```html
<s-search-field
  label="Search collections"
  name="collectionSearch"
  minLength="3"
  maxLength="50"
  placeholder="Enter at least 3 characters"
></s-search-field>
```

***

## Best practices

* **Use for inline search:** Choose the component for filtering content within specific sections or lists. For global navigation or complex multi-step searches, use a more robust search pattern.
* **Make the search scope clear:** Users need to understand what they're searching through. Use specific labels and placeholders that explain what content will be searched and what attributes they can search by.
* **Provide immediate feedback:** Show search results or filtered content as merchants type when possible. Immediate feedback helps merchants refine their search query and builds confidence in the search functionality.
* **Handle empty states gracefully:** When the search field is cleared or returns no results, show appropriate messaging. For cleared searches, restore the full content list. For no results, suggest alternative actions or broaden the search criteria.
* **Set appropriate search thresholds:** Prevent searches that would return overwhelming or meaningless results. Starting searches after 2-3 characters gives the system enough information to provide useful results.

***
