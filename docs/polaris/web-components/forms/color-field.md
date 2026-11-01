---
title: Color field
description: >-
  The color field component allows users to select colors through an integrated
  color picker or direct text input. Use color field for theme colors, brand
  colors, or any color selection to provide both visual and text-based color
  input methods.
api_version: v2.0
source_url:
  html: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/color-field
  md: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/color-field.md
api_name: app-home
---

# Color field

The color field component allows users to select colors through an integrated color picker or direct text input. Use color field for theme colors, brand colors, or any color selection to provide both visual and text-based color input methods.

Color fields support hex color codes, color preview swatches, and validation to ensure users select or enter valid color values. For a standalone visual color palette interface without text input, use [color picker](https://shopify.dev/docs/api/app-home/latest/web-components/forms/color-picker).

#### Use cases

* **Color input:** Collect color values through text input with hex color validation.
* **Manual entry:** Enable manual hex color entry for precise color specification.
* **Color codes:** Input color codes for themes, branding, or product attributes.
* **Keyboard input:** Provide keyboard-friendly color input alternative to color pickers.

```html
<s-color-field label="Brand color" value="#008060"></s-color-field>
```

***

## Properties

Configure the following properties on the color field component.

* **alpha**

  **boolean**

  **Default: false**

  Allow user to select an alpha value.

* **autocomplete**

  **"on" | "off"**

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

  The current value for the field. If omitted, the field will be empty.

### ComponentChildren

Represents any valid children that can be rendered within a component, including elements, strings, numbers, or arrays of these types. This is an alias for Preact's \`ComponentChildren\` type.

```ts
preact.ComponentChildren
```

### Events

The color field component provides event callbacks for handling user interactions. Learn more about [handling events](https://shopify.dev/docs/api/polaris/using-polaris-web-components#handling-events).

* **blur**

  **CallbackEventListener<'input'>**

  A callback fired when the color field loses focus.

  Learn more about the [blur event](https://developer.mozilla.org/en-US/docs/Web/API/Element/blur_event).

* **change**

  **CallbackEventListener<'input'>**

  A callback fired when the color field value changes.

  Learn more about the [change event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/change_event).

* **focus**

  **CallbackEventListener<'input'>**

  A callback fired when the color field receives focus.

  Learn more about the [focus event](https://developer.mozilla.org/en-US/docs/Web/API/Element/focus_event).

* **input**

  **CallbackEventListener<'input'>**

  A callback fired when the user inputs data into the color field.

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

### Pick a color

Display a labeled color field with a pre-selected hex value.

## html

```html
<s-color-field
  label="Brand color"
  value="#FF0000"
></s-color-field>
```

### Add a label

Identify the color field's purpose clearly. This example displays a labeled color field with a name attribute for form submission.

## html

```html
<s-stack gap="base">
  <s-color-field label="Brand color" name="color" value="#FF0000"></s-color-field>
</s-stack>
```

### Mark as required

Ensure users provide a color value before submitting. This example presents a required color field that must have a value.

## html

```html
<s-stack gap="base">
  <s-color-field label="Brand color" value="#FF0000" required></s-color-field>
</s-stack>
```

### Enable alpha transparency

Allow selection of semi-transparent colors. This example displays a color field with alpha enabled, presenting an RGBA value with 50% opacity.

## html

```html
<s-stack gap="base">
  <s-color-field
    label="Background color"
    value="rgba(255, 0, 0, 0.5)"
    alpha
  ></s-color-field>
</s-stack>
```

### Show a validation error

Communicate color format problems clearly. This example demonstrates an error message when an invalid hex code is entered.

## html

```html
<s-stack gap="base">
  <s-color-field
    label="Brand color"
    name="brandColor"
    value="#invalid"
    error="Please enter a valid color format (hex, rgb, or rgba)"
    required
  ></s-color-field>
</s-stack>
```

### Add helper text

Guide users on how the color will be used. This example adds helper text beneath the field explaining the color's purpose.

## html

```html
<s-stack gap="base">
  <s-color-field
    label="Primary color"
    value="#1a73e8"
    details="Main brand color used for buttons and links"
  ></s-color-field>
</s-stack>
```

### Show a read-only field

Show a color value without allowing changes. This example presents a read-only color field displaying a locked value.

## html

```html
<s-stack gap="base">
  <s-color-field label="System color" name="color" value="#1a73e8" readOnly></s-color-field>
</s-stack>
```

### Combine multiple fields in a form

Build a complete theme customization interface. This example combines multiple color fields for primary, secondary, and overlay colors with helper text.

## html

```html
<s-stack gap="base">
  <s-section>
    <s-heading>Theme settings</s-heading>
    <s-stack gap="base">
      <s-color-field
        label="Primary brand color"
        name="primaryColor"
        value="#1a73e8"
        defaultValue="#1a73e8"
        details="This color will be used for buttons, links, and brand elements"
        required
      ></s-color-field>
      <s-color-field
        label="Secondary color"
        name="secondaryColor"
        value="#34a853"
        details="Used for secondary actions and accents"
      ></s-color-field>
      <s-color-field
        label="Background overlay"
        name="overlayColor"
        value="rgba(0, 0, 0, 0.5)"
        alpha
        details="Background color for modal overlays and dropdowns"
      ></s-color-field>
    </s-stack>
  </s-section>
</s-stack>
```

### Validate in real time

Provide immediate feedback on color format validity. This example demonstrates real-time validation that checks hex format as the user types.

## html

```html
<s-section>
  <s-stack gap="base" justifyContent="start">
    <s-text-field label="Theme name"></s-text-field>
    <s-color-field
      label="Brand color"
      name="Color"
      value="#invalid"
      error="Please enter a valid color format"
      required
    ></s-color-field>
  </s-stack>
</s-section>
```

***

## Best practices

* **Label by specific purpose:** Use labels that describe exactly what the color affects (**Button background color**, **Heading text color**, or **Border accent color** rather than generic **Color**).
* **Pre-populate when editing:** Always show the current color value when editing existing settings so merchants understand what they're changing from.

***

## Limitations

* The component always outputs values in hex format. While it accepts multiple input formats (hex, RGB, HSL), the `change` event emits values in hex: 6-digit (`#RRGGBB`) or 8-digit with alpha (`#RRGGBBAA`).

***
