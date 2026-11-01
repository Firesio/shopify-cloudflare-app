---
title: Money field
description: >-
  The money field component collects monetary values from users with built-in
  currency formatting and validation. Use money field for prices, costs, or
  financial amounts to provide proper currency symbols, decimal handling, and
  numeric validation.
api_version: v2.0
source_url:
  html: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/money-field
  md: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/money-field.md
api_name: app-home
---

# Money field

The money field component collects monetary values from users with built-in currency formatting and validation. Use money field for prices, costs, or financial amounts to provide proper currency symbols, decimal handling, and numeric validation.

Money fields support currency codes, automatic formatting, and min/max constraints to ensure users enter valid monetary values. For non-currency numeric input, use [number field](https://shopify.dev/docs/api/app-home/latest/web-components/forms/number-field).

#### Use cases

* **Price input:** Capture product prices, discounts, or fee amounts with currency formatting.
* **Financial thresholds:** Set monetary thresholds for promotions, shipping, or alerts.
* **Cost tracking:** Input costs, expenses, or budget amounts.
* **Refund amounts:** Collect refund or adjustment amounts in financial workflows.

```html
<s-money-field label="Price" value="24.99"></s-money-field>
```

***

## Properties

Configure the following properties on the money field component.

* **autocomplete**

  **string**

  **Default: 'on' for everything else**

  A hint as to the intended content of the field.

  When set to `on` (the default), this property indicates that the field should support autofill, but you do not have any more semantic information on the intended contents.

  When set to `off`, you are indicating that this field contains sensitive information, or contents that are never saved, like one-time codes.

  Alternatively, you can provide value which describes the specific data you would like to be entered into this field during autofill.

* **currency​Code**

  **"auto" | "USD" | "EUR" | "GBP" | "CAD" | "AFN" | "ALL" | "DZD" | "AOA" | "ARS" | "AMD" | "AWG" | "AUD" | "BBD" | "AZN" | "BDT" | "BSD" | "BHD" | "BIF" | "BZD" | "BMD" | "BTN" | "BAM" | ... 138 more ... | "XXX"**

  **Default: 'auto'**

  The currency code of the field.

  When set to 'auto', the field will display the currency code of the shop. If no currency code is set for the shop, resolve to 'XXX' the explicit non value.

  This value will match the global currency code of the shop, so if you need to know the currency code of the field, you can read the value from those APIs.

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

* **max**

  **number**

  **Default: Infinity**

  The highest decimal or integer value accepted for the field. When used with `step`, the value rounds down to the maximum number.

  Users can still type values higher than the maximum using the keyboard. Implement validation to enforce this constraint.

* **min**

  **number**

  **Default: -Infinity**

  The lowest decimal or integer value accepted for the field. When used with `step`, the value rounds up to the minimum number.

  Users can still type values lower than the minimum using the keyboard. Implement validation to enforce this constraint.

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

### ComponentChildren

Represents any valid children that can be rendered within a component, including elements, strings, numbers, or arrays of these types. This is an alias for Preact's \`ComponentChildren\` type.

```ts
preact.ComponentChildren
```

### Events

The money field component provides event callbacks for handling user interactions. Learn more about [handling events](https://shopify.dev/docs/api/polaris/using-polaris-web-components#handling-events).

* **blur**

  **CallbackEventListener<'input'>**

  A callback fired when the money field loses focus.

  Learn more about the [blur event](https://developer.mozilla.org/en-US/docs/Web/API/Element/blur_event).

* **change**

  **CallbackEventListener<'input'>**

  A callback fired when the money field value changes.

  Learn more about the [change event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/change_event).

* **focus**

  **CallbackEventListener<'input'>**

  A callback fired when the money field receives focus.

  Learn more about the [focus event](https://developer.mozilla.org/en-US/docs/Web/API/Element/focus_event).

* **input**

  **CallbackEventListener<'input'>**

  A callback fired when the user inputs data into the money field.

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

### Collect a currency value

Capture monetary values with automatic currency formatting. This example pairs a label with placeholder text and helper details.

## html

```html
<s-money-field
  label="Regional Price"
  placeholder="99.99"
  details="Recommended price for the European market"
></s-money-field>
```

### Add a label and constraints

Set input boundaries for valid amounts. This example configures min/max limits to constrain the accepted value range.

## html

```html
<s-money-field
  label="Price"
  value="19.99"
  min="0"
  max="1000"
></s-money-field>
```

### Handle validation errors

Communicate input problems clearly to users. This example displays an error message when the entered value is invalid.

## html

```html
<s-money-field
  label="Product cost"
  min="0.01"
  error="Product cost is required"
></s-money-field>
```

### Combine multiple fields in a form

Collect multiple monetary values in a single form. This example groups money fields for price, compare-at price, and cost with individual constraints.

## html

```html
<s-stack direction="block" gap="base">
  <s-money-field
    label="Price"
    value="0.00"
    min="0.01"
    max="99999.99"
    details="Customers will see this price"
  ></s-money-field>


  <s-money-field
    label="Compare at price"
    value=""
    min="0"
    max="99999.99"
    details="Show customers the original price when on sale"
  ></s-money-field>


  <s-money-field
    label="Cost per item"
    value=""
    min="0"
    max="99999.99"
    details="Customers won't see this"
  ></s-money-field>
</s-stack>
```

***

## Best practices

* **Set realistic min/max constraints:** For product prices, use `min={0.01}` to prevent zero prices. For discounts, use `min={0}` and `max={orderTotal}`. For refunds, use `max={amountPaid}`. Always validate against business logic limits.
* **Provide specific validation feedback:** Instead of **Invalid amount**, show **Price must be at least $0.01** or **Discount can't exceed $50.00 order total**. Explain the exact constraint violated.
* **Never add currency symbols to labels:** Don't add **$** or other currency symbols to the label or placeholder, as this can create confusion with any currency formatting the component provides.
* **Label by specific monetary purpose:** Use labels like **Product base price**, **Discount amount**, **Shipping rate per kg**, or **Subscription renewal fee** instead of vague **Amount** or **Price**.
* **Pre-fill when editing existing values:** Always populate the field with the current value when editing. For new entries, consider smart defaults like **0.00** or typical price points for your product category.

***

## Limitations

* The component outputs values as strings, but converting to JavaScript numbers for arithmetic can cause floating-point precision errors. Always perform critical financial calculations on the server using decimal-precise arithmetic or integer cents (multiply by 100).
* The component formats currency based on the merchant's store currency and locale. The same numeric value might display as **$1,234.56** (en-US) vs **1 234,56 $** (fr-FR). Test your UI with various currency/locale combinations if you operate internationally.
* Currencies like JPY (¥), KRW (₩), and VND (₫) don't use decimal places. The component might still allow decimal input but this will be invalid for these currencies. Validate the currency's decimal places on the backend.
* The component doesn't perform currency conversion. If you need to display amounts in multiple currencies, you must handle conversion rates and calculations separately.

***
