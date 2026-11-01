---
title: URL field
description: >-
  The URL field component collects URLs from users with built-in formatting and
  validation. Use URL field for website addresses, link destinations, or any URL
  input to provide URL-specific keyboard layouts and automatic validation.
api_version: v2.0
source_url:
  html: 'https://shopify.dev/docs/api/app-home/latest/web-components/forms/url-field'
  md: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/forms/url-field.md
api_name: app-home
---

# URL field

The URL field component collects URLs from users with built-in formatting and validation. Use URL field for website addresses, link destinations, or any URL input to provide URL-specific keyboard layouts and automatic validation.

URL fields support protocol prefixing, validation, and help text to guide users toward entering properly formatted web addresses. For general text input, use [text field](https://shopify.dev/docs/api/app-home/latest/web-components/forms/text-field).

#### Use cases

* **Website links:** Collect product URLs, manufacturer websites, or reference links.
* **Integration endpoints:** Capture webhook URLs or API endpoints for integrations.
* **External resources:** Link to external resources like documentation or related products.
* **Media URLs:** Input URLs for external images, videos, or other media assets.

```html
<s-url-field label="Website" value="https://example.com"></s-url-field>
```

***

## Properties

Configure the following properties on the URL field component.

* **autocomplete**

  **"on" | "off" | \`section-${string} url\` | \`section-${string} photo\` | \`section-${string} impp\` | \`section-${string} home impp\` | \`section-${string} mobile impp\` | \`section-${string} fax impp\` | \`section-${string} pager impp\` | "shipping url" | "shipping photo" | "shipping impp" | "shipping home impp" | "shipping mobi...**

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

### ComponentChildren

Represents any valid children that can be rendered within a component, including elements, strings, numbers, or arrays of these types. This is an alias for Preact's \`ComponentChildren\` type.

```ts
preact.ComponentChildren
```

### Events

The URL field component provides event callbacks for handling user interactions. Learn more about [handling events](https://shopify.dev/docs/api/polaris/using-polaris-web-components#handling-events).

* **blur**

  **CallbackEventListener<'input'>**

  A callback fired when the URL field loses focus.

  Learn more about the [blur event](https://developer.mozilla.org/en-US/docs/Web/API/Element/blur_event).

* **change**

  **CallbackEventListener<'input'>**

  A callback fired when the URL field value changes.

  Learn more about the [change event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/change_event).

* **focus**

  **CallbackEventListener<'input'>**

  A callback fired when the URL field receives focus.

  Learn more about the [focus event](https://developer.mozilla.org/en-US/docs/Web/API/Element/focus_event).

* **input**

  **CallbackEventListener<'input'>**

  A callback fired when the user inputs data into the URL field.

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

### Collect a URL

Capture web addresses from users with URL-specific input. This example pairs a label with placeholder text guiding the expected format.

## html

```html
<s-url-field
  label="Your website"
  details="Enter your business website"
  placeholder="https://example.com"
></s-url-field>
```

### Set validation constraints

Enforce URL requirements before form submission. This example configures required validation with length constraints and custom error messages.

## html

```html
<s-url-field
  label="Company website"
  required
  minLength="10"
  maxLength="200"
  error="Please enter a valid website URL"
></s-url-field>
```

### Pre-fill a URL

Display a URL that users can copy but not edit. This example uses readOnly to prevent changes while keeping the value selectable and included in form submissions.

## html

```html
<s-url-field
  label="Profile URL"
  value="https://shop.myshopify.com"
  readOnly
></s-url-field>
```

### Show a disabled field

Show a URL in a non-interactive state. This example uses disabled to gray out the field and exclude it from form submission.

## html

```html
<s-url-field
  label="Store URL"
  value="https://your-store.myshopify.com"
  disabled
></s-url-field>
```

***

## Best practices

* **Validate URL structure:** Browser validation for URL fields is minimal and inconsistent. Implement your own validation to ensure URLs have proper structure, valid protocols, and acceptable formats for your use case.
* **Make the expected format clear:** Users need to know whether to include protocols, what protocols are acceptable, and what type of URL you're expecting. Show complete example URLs in placeholders to demonstrate the required format.
* **Handle missing protocols gracefully:** Users often forget to include `https://` when entering URLs. Decide whether to automatically add it, accept URLs without protocols, or show clear error messages explaining what's missing.
* **Set realistic length constraints:** URL length limits vary across browsers and servers. Set constraints based on where the URL will be used, not just arbitrary maximums. Communicate these limits clearly when they're necessary.
* **Provide clear context:** Make the URL's purpose obvious through labels and help text. Users entering a product image URL have different needs than those entering a social media profile link or external reference.

***

## Limitations

* The HTML5 URL input type (`type="url"`) has very basic validation that varies by browser. Most browsers only check for **://** somewhere in the string. Invalid URLs like **ht://invalid** might pass browser validation. Always implement comprehensive server-side URL validation.
* While RFC 3986 doesn't specify a maximum URL length, the practical recommended limit for broad compatibility across web clients and servers is 2,048 characters. Modern browsers support much longer URLs, but many servers have lower limits for request URIs. Setting `maxLength` above 2,048 might create URLs that work in some contexts but fail in others.
* URLs starting with **//** (protocol-relative, like **//example.com**) are technically valid but might not pass HTML5 URL validation. Users must include the full protocol (http:// or https://).
* This component doesn't automatically prepend **https://** if merchants omit the protocol. A value like **example.com** will be invalid and require manual correction. You must implement this behavior yourself if desired.
* URLs with special characters (spaces, quotes, Unicode) should be percent-encoded (%20, %22), but the component doesn't auto-encode. Provide guidance to merchants or implement encoding in your validation logic.

***
