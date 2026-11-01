---
title: Password field
description: >-
  The password field component securely collects sensitive information from
  users. Use password field for password entry, where input characters are
  automatically masked for privacy.
api_version: v2.0
source_url:
  html: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/password-field
  md: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/password-field.md
api_name: app-home
---

# Password field

The password field component securely collects sensitive information from users. Use password field for password entry, where input characters are automatically masked for privacy.

Password fields support validation, help text, and accessibility features to create secure and user-friendly authentication experiences. For general text input, use [text field](https://shopify.dev/docs/api/app-home/latest/web-components/forms/text-field).

#### Use cases

* **API credentials:** Collect API keys or secret tokens for third-party integrations.
* **Secure configuration:** Capture sensitive configuration values that should be masked.
* **Authentication:** Implement authentication workflows requiring password entry.
* **Encryption keys:** Collect encryption keys or other sensitive credentials securely.

```html
<s-password-field label="Example password" value="demo-password" details="Use sample values only. Edits appear in the code below."></s-password-field>
```

***

## Properties

Configure the following properties on the password field component.

* **autocomplete**

  **"on" | "off" | PasswordAutocompleteField | \`section-${string} current-password\` | \`section-${string} new-password\` | "shipping current-password" | "shipping new-password" | "billing current-password" | "billing new-password" | \`section-${string} shipping current-password\` | \`section-${string} shipping new-password\` | \`section-${string} billing current-password\` | \`section-${string} billing new-password\`**

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

### PasswordAutocompleteField

Represents autocomplete values that are valid for password input fields. This is a subset of \`AnyAutocompleteField\` containing only fields suitable for password inputs. Available values: - \`current-password\` - Existing password for login or authentication - \`new-password\` - New password when creating an account or changing password

```ts
'current-password' | 'new-password'
```

### ComponentChildren

Represents any valid children that can be rendered within a component, including elements, strings, numbers, or arrays of these types. This is an alias for Preact's \`ComponentChildren\` type.

```ts
preact.ComponentChildren
```

### Events

The password field component provides event callbacks for handling user interactions. Learn more about [handling events](https://shopify.dev/docs/api/polaris/using-polaris-web-components#handling-events).

* **blur**

  **CallbackEventListener<'input'>**

  A callback fired when the password field loses focus.

  Learn more about the [blur event](https://developer.mozilla.org/en-US/docs/Web/API/Element/blur_event).

* **change**

  **CallbackEventListener<'input'>**

  A callback fired when the password field value changes.

  Learn more about the [change event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/change_event).

* **focus**

  **CallbackEventListener<'input'>**

  A callback fired when the password field receives focus.

  Learn more about the [focus event](https://developer.mozilla.org/en-US/docs/Web/API/Element/focus_event).

* **input**

  **CallbackEventListener<'input'>**

  A callback fired when the user inputs data into the password field.

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

### Collect a password

Securely collect sensitive credentials from users. This example pairs a label with masked input.

## html

```html
<s-password-field
  label="Password"
  placeholder="Enter your password"
  details="Must be at least 8 characters long"
  minLength="8"
></s-password-field>
```

### Set validation rules

Enforce password requirements before submission. This example configures a required field with minimum length validation and autocomplete for new passwords.

## html

```html
<s-password-field
  label="Password"
  name="password"
  required
  minLength="8"
  autocomplete="new-password"
></s-password-field>
```

### Show validation errors

Communicate password problems clearly to users. This example displays an error message when the password doesn't meet length requirements.

## html

```html
<s-password-field
  label="Password"
  name="password"
  error="Password must be at least 8 characters"
  minLength="8"
  autocomplete="new-password"
></s-password-field>
```

### Add helper text

Help users understand password requirements upfront. This example adds helper text beneath the field explaining what makes a valid password.

## html

```html
<s-password-field
  label="Create password"
  name="new-password"
  details="Password must be at least 8 characters and include uppercase, lowercase, and numbers"
  minLength="8"
  autocomplete="new-password"
></s-password-field>
```

### Build a login form

Create a complete authentication form. This example combines a password field with an email field for login or registration.

## html

```html
<s-stack gap="base">
  <s-email-field
    label="Email"
    name="email"
    autocomplete="email"
    required
  ></s-email-field>
  <s-password-field
    label="Password"
    name="password"
    autocomplete="current-password"
    required
  ></s-password-field>
</s-stack>
```

### Display a requirement checklist

Display a password requirements checklist alongside the field. This example lists requirements like character length and case requirements.

## html

```html
<s-stack gap="large-100">
  <s-password-field
    label="Create password"
    name="password"
    value="example-password"
    autocomplete="new-password"
    required
  ></s-password-field>
  <s-stack gap="small-200">
    <s-text tone="success">✓ At least 8 characters</s-text>
    <s-text color="subdued">○ Contains uppercase letter</s-text>
    <s-text color="subdued">○ Contains lowercase letter</s-text>
    <s-text color="subdued">○ Contains number</s-text>
  </s-stack>
</s-stack>
```

***

## Best practices

* **Support password managers:** Ensure the component works correctly with password managers by setting appropriate autocomplete values. Password managers help merchants create and store strong passwords, improving overall security.
* **Communicate requirements clearly:** Show all password requirements before merchants start typing, not after they've already entered an invalid password. This prevents frustration and reduces form abandonment.
* **Provide helpful feedback for password creation:** When merchants create new passwords, show real-time strength feedback and explain what would make their password stronger. Help them understand security trade-offs rather than just enforcing arbitrary rules.
* **Never block paste functionality:** Merchants rely on password managers and other tools that use paste. Blocking paste forces merchants toward weaker passwords they can remember and type manually.
* **Validate server-side:** Always validate passwords on the server. Client-side constraints can be bypassed by password managers, browser extensions, or merchants with developer tools. Use client-side validation for immediate feedback, not security.

***

## Limitations

* The component doesn't include a built-in show/hide password toggle. If you need this feature (recommended for better UX), you must implement it yourself by conditionally switching between a password field and a text field.

***
