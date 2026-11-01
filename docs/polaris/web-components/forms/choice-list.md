---
title: Choice list
description: >-
  The choice list component presents multiple options for single or multiple
  selections. Use it when merchants need to choose from a defined set of
  options, such as filtering results or collecting preferences.
api_version: v2.0
source_url:
  html: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/choice-list
  md: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/choice-list.md
api_name: app-home
---

# Choice list

The choice list component presents multiple options for single or multiple selections. Use it when merchants need to choose from a defined set of options, such as filtering results or collecting preferences.

The component supports both single selection (radio button behavior) and multiple selection (checkbox behavior) modes. It includes configurable labels, help text, and validation. Choices always stack vertically, and there's no property to lay them out horizontally. For compact dropdown selection with four or more options, or when a vertical list of single-selection choices doesn't fit your layout, use [select](https://shopify.dev/docs/api/app-home/latest/web-components/forms/select).

#### Use cases

* **Radio groups:** Create single-selection option groups presented as radio buttons.
* **Checkbox groups:** Allow multiple selections from a list of related options.
* **Settings options:** Present configuration choices in structured, accessible formats.
* **Filter controls:** Build filtering interfaces with multiple selection criteria.

```html
<s-choice-list label="Delivery options" name="delivery">
  <s-choice value="standard" selected>Standard delivery</s-choice>
  <s-choice value="express">Express delivery</s-choice>
  <s-choice value="pickup">Store pickup</s-choice>
</s-choice-list>
```

***

## Properties

Configure the following properties on the choice list component.

* **details**

  **ComponentChildren**

  Supplementary text displayed below the field to provide additional context, instructions, or help. Use this to clarify the expected input or provide guidance to users. This text is announced to screen readers.

* **disabled**

  **boolean**

  **Default: false**

  Whether the field is disabled, preventing any user interaction. When `true`, the `disabled` property on any child choices is ignored.

* **error**

  **ComponentChildren**

  An error message displayed below the field to indicate validation problems. When set, the field is styled with error indicators and the message is announced to screen readers.

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

* **multiple**

  **boolean**

  **Default: false**

  Whether multiple choices can be selected.

* **name**

  **string**

  The name attribute for the field, used to identify the field's value when the form is submitted. Must be unique within the nearest containing form.

* **values**

  **string\[]**

  An array of `value` attributes for the currently selected options. When provided, this property automatically sets the `selected` state on child option components that have matching `value` attributes. Options with values included in this array will be marked as selected, while others will be unselected.

### ComponentChildren

Represents any valid children that can be rendered within a component, including elements, strings, numbers, or arrays of these types. This is an alias for Preact's \`ComponentChildren\` type.

```ts
preact.ComponentChildren
```

### Events

The choice list component provides event callbacks for handling user interactions. Learn more about [handling events](https://shopify.dev/docs/api/polaris/using-polaris-web-components#handling-events).

* **change**

  **CallbackEventListener\<typeof tagName> | null**

  A callback fired when the choice list selection changes.

  Learn more about the [change event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/change_event).

* **input**

  **CallbackEventListener\<typeof tagName> | null**

  A callback fired when the user inputs data into the choice list.

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

## Choice

The choice component creates individual selectable options within a choice list. Use choice to define each option that merchants can select, supporting both single selection (radio buttons) and multiple selection (checkboxes) modes.

Choice components support labels, help text, and custom content through slots, providing flexible option presentation within choice lists.

* **accessibility​Label**

  **string**

  A label that describes the purpose or content of the component for assistive technologies like screen readers. Use this to provide additional context when the visible content alone doesn't clearly convey the component's purpose.

* **default​Selected**

  **boolean**

  **Default: false**

  The initial selected state for uncontrolled components. Use this when you want the option to start selected but don't need to control its state afterward.

* **disabled**

  **boolean**

  **Default: false**

  Whether the control is disabled, preventing user interaction. Disabled controls appear dimmed and their values aren't submitted with forms.

* **selected**

  **boolean**

  **Default: false**

  Whether the option is currently selected. Use this for controlled components where you manage the selection state.

* **value**

  **string**

  The value submitted with the form when this control is selected. If not specified, the default value is "on".

### Slots

The choice list component supports slots for additional content placement within each choice. Learn more about [using slots](https://shopify.dev/docs/api/polaris/using-polaris-web-components#slots).

* **children**

  **HTMLElement**

  The label text or elements that identify this selectable choice to users.

  The label is produced by extracting and concatenating the text nodes from the provided content; any markup or element structure is ignored.

* **details**

  **HTMLElement**

  Additional text to provide context or guidance for the input.

  This text is displayed along with the input and its label to offer more information or instructions to the user.

* **secondary-content**

  **HTMLElement**

  Additional content to display below the choice label. Can include rich content like TextFields, Buttons, or other interactive components. Event handlers on React components are preserved.

***

## Examples

### Add a single-select choice list

Present a group of options for merchants to choose from using radio buttons. This example shows a single-select choice list component with a label, help text, and an `onChange` handler.

## html

```html
<script>
  const handleChange = (event) =>
    console.log('Values: ', event.currentTarget.values);
</script>
<s-choice-list
  label="Company name"
  name="Company name"
  details="The company name will be displayed on the checkout page."
  onChange="handleChange(event)"
>
  <s-choice value="hidden">Hidden</s-choice>
  <s-choice value="optional">Optional</s-choice>
  <s-choice value="required">Required</s-choice>
</s-choice-list>
```

### Pre-select a default option

Set a default selection so merchants see a pre-selected option when the form loads. This example shows a single-select choice list with one option already selected.

## html

```html
<s-choice-list label="Product visibility" name="visibility">
  <s-choice value="hidden">Hidden</s-choice>
  <s-choice value="optional">Optional</s-choice>
  <s-choice value="required" selected>Required</s-choice>
</s-choice-list>
```

### Enable multiple selections with details

Allow merchants to select more than one option using checkboxes instead of radio buttons. This example shows a multi-select choice list with descriptive details on each option.

## html

```html
<s-choice-list label="Checkout options" name="checkout" multiple>
  <s-choice value="shipping" selected>
    Use the shipping address as the billing address by default
    <s-text slot="details">
      Reduces the number of fields required to check out. The billing address
      can still be edited.
    </s-text>
  </s-choice>
  <s-choice value="confirmation">
    Require a confirmation step
    <s-text slot="details">
      Customers must review their order details before purchasing.
    </s-text>
  </s-choice>
</s-choice-list>
```

### Show a validation error

Display an error message when a selection is invalid or a required choice has not been made. This example shows a choice list with a static error message.

## html

```html
<s-choice-list
  label="Product visibility"
  error="Please select an option"
>
  <s-choice value="hidden">Hidden</s-choice>
  <s-choice value="optional">Optional</s-choice>
  <s-choice value="required">Required</s-choice>
</s-choice-list>
```

### Disable a choice list

Disable a choice list to prevent interaction while keeping the current selection visible. This example shows a disabled choice list with a pre-selected option.

## html

```html
<s-choice-list label="Account type" name="account-type" disabled>
  <s-choice value="basic" selected>Basic</s-choice>
  <s-choice value="advanced">Advanced</s-choice>
  <s-choice value="enterprise">Enterprise</s-choice>
</s-choice-list>
```

***

## Best practices

* **Choose appropriate selection modes:** Use single selection for mutually exclusive options like payment methods or shipping speeds. Enable `multiple` when merchants can select more than one.
* **Write clear, specific labels:** Use choice labels that describe the outcome, like **Email notifications for new orders** rather than just **Email**. Keep labels concise but descriptive enough that merchants understand each option without additional explanation.
* **Write clear titles:** Use titles that pose a clear question or statement, like **Which shipping method?** or **Select notification preferences**. Avoid vague titles like **Options** or **Settings**.
* **Add context to complex choices:** Use the `details` slot on individual choices (for example, `<s-text slot="details">`) to explain implications when needed.
* **Provide actionable validation:** Show specific error messages like **Please select at least one notification preference** rather than generic **Required field**.

***

## Limitations

* The component doesn't include search, filtering, or lazy loading. For large option sets (20+ choices), consider using a [select](https://shopify.dev/docs/api/app-home/latest/web-components/forms/select) dropdown instead.
* Rendering 50+ checkboxes or radio buttons can cause noticeable performance issues, especially on mobile devices. Consider pagination, virtualization, or alternative UI patterns for large lists.
* The component is either single-selection (radio buttons) or multiple-selection (checkboxes) for all choices. You can't mix both types in the same list.
* Component types other than choice can't be used as options within the choice list.

***
