---
title: Number
description: >-
  The number component displays inline numeric values with tabular numerals, so
  figures keep a consistent width and line up in columns. Use number for prices,
  quantities, counts, and any other figure that appears alongside other figures.
api_version: v2.0
source_url:
  html: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number
  md: >-
    https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number.md
api_name: app-home
---

# Number

The number component displays inline numeric values with tabular numerals, so figures keep a consistent width and line up in columns. Use number for prices, quantities, counts, and any other figure that appears alongside other figures.

Number applies tabular numerals automatically, which is what makes it different from [text](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/text). It renders the value you give it without formatting, rounding, or localizing it. It supports the same tones, sizes, and weights as the other typography components, so numeric content stays consistent with surrounding copy. For non-numeric inline content, use [text](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/text).

#### Use cases

* **Columns of figures:** Align prices, quantities, or totals so digits stack in columns without shifting width.
* **Metrics and counts:** Display order counts, inventory levels, or other figures in summaries.
* **Status figures:** Pair a tone with a figure to signal a low, healthy, or critical value.

```html
<s-number>17,660</s-number>
```

***

## Properties

Configure the following properties on the number component.

* **accessibility​Visibility**

  **"visible" | "hidden" | "exclusive"**

  **Default: 'visible'**

  The visibility mode of the element for both visual and assistive technology users.

  * `visible`: The element is visible to all users (both sighted users and screen readers).
  * `hidden`: The element is visually visible but hidden from screen readers. Use this for decorative elements that don't provide meaningful information.
  * `exclusive`: The element is visually hidden but announced by screen readers. Use this for screen-reader-only content like skip links or additional context.

* **color**

  **"base" | "subdued"**

  **Default: 'base'**

  The color emphasis applied to the number.

  * `base`: Standard emphasis for numeric content.
  * `subdued`: Deemphasized color for secondary or supporting numeric content.

* **dir**

  **"" | "auto" | "ltr" | "rtl"**

  **Default: ''**

  Indicates the directionality of the element’s text.

  * `""`: The direction is inherited from parent elements (equivalent to not setting the attribute).
  * `auto`: The user agent determines the direction based on the content.
  * `ltr`: The languages written from left to right (such as English).
  * `rtl`: The languages written from right to left (such as Arabic).

  Learn more about the [dir attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/dir).

* **font​Size**

  **"small" | "small-200" | "small-100" | "base" | "large" | "large-100" | "auto"**

  **Default: 'auto'**

  Font size of the number. The named values also apply their matching line-height and letter-spacing.

* **font​Weight**

  **"bold" | "base" | "auto" | "medium" | "semibold"**

  **Default: 'auto'**

  Font weight of the number.

* **tone**

  **"info" | "success" | "warning" | "critical" | "auto" | "neutral" | "caution"**

  **Default: 'auto'**

  The semantic tone that's applied to the number, which changes its color to convey meaning.

  * `info`: Informational content or helpful tips (blue).
  * `success`: Positive outcomes or successful states (green).
  * `warning`: Important warnings about potential issues (orange).
  * `critical`: Urgent problems or destructive actions (red).
  * `auto`: Automatically determined based on context.
  * `neutral`: General information without specific intent (gray).
  * `caution`: Advisory notices that need attention (yellow).

***

## Examples

### Align figures in a column

Use number for figures that appear above or below each other. Tabular numerals give every digit the same width, so the values line up without extra alignment styles.

## html

```html
<s-stack gap="small-100">
  <s-number>1,204</s-number>
  <s-number>98</s-number>
  <s-number>17,660</s-number>
</s-stack>
```

### Communicate status with tones

Set the `tone` property to signal what a figure means. This example shows `critical`, `warning`, and `success` tones for inventory levels that need different levels of attention.

## html

```html
<s-stack gap="small-100">
  <s-number tone="critical">0</s-number>
  <s-number tone="warning">3</s-number>
  <s-number tone="success">148</s-number>
</s-stack>
```

### Emphasize a total

Combine `fontSize` and `fontWeight` to make a summary figure stand out from the values it totals. This example shows a larger, bolder order total beneath a subdued subtotal.

## html

```html
<s-stack gap="small-100">
  <s-number color="subdued">$248.00</s-number>
  <s-number fontSize="large" fontWeight="bold">$271.52</s-number>
</s-stack>
```

### De-emphasize a secondary figure

Set the `color` property to `subdued` for figures that support the main value rather than compete with it. This example shows a subdued comparison figure next to a base-color current value.

## html

```html
<s-stack direction="inline" gap="small">
  <s-number>1,204</s-number>
  <s-number color="subdued">1,013</s-number>
</s-stack>
```

***

## Best practices

* **Use number for figures, not for labels:** Apply number to the numeric value itself and leave the surrounding words in [text](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/text) or [paragraph](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/paragraph). Tabular numerals help figures line up, but they make ordinary words look uneven.
* **Format the value before you render it:** Number controls how digits are displayed, not how they're formatted. Apply currency symbols, decimal places, and thousands separators in your app so the figure matches the merchant's locale.
* **Keep tones meaningful:** Apply a tone when the figure itself carries a status, like a stock level that's run out. A tone on every figure makes none of them stand out.
* **Pair size with hierarchy:** Use a larger `fontSize` for the figure a merchant should read first, such as a total, and keep supporting figures at the base size.

***

## Limitations

* Number renders inline and doesn't add spacing of its own. Use layout components like [stack](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/stack) to control the space around figures.
* Tabular numerals apply to digits. Currency symbols and letters in the same string render with their normal widths.

***
