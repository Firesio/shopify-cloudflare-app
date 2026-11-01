---
title: Settings
description: >-
  All apps have settings merchants need to configure to control your app's
  behavior. For React Router-based Shopify apps, this will be defined in a route
  file like app.settings.jsx.
api_version: v2.0
source_url:
  html: 'https://shopify.dev/docs/api/app-home/latest/patterns/templates/settings'
  md: 'https://shopify.dev/docs/api/app-home/latest/patterns/templates/settings.md'
api_name: app-home
---

# Settings

All apps have settings merchants need to configure to control your app's behavior. For React Router-based Shopify apps, this will be defined in a route file like `app.settings.jsx`.

The settings template organizes related options into logical groups that provide contextual help alongside form controls. It also leverages the Save Bar API to protect unsaved changes from being lost.

Make each group a [section](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section). Name the group with [`heading`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#section-propertydetail-heading), and explain what it controls with [`subheading`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#section-propertydetail-subheading) rather than a paragraph in the section body. When a group holds a list of items that each have their own status or action, such as connected accounts or tools, nest a section for each item so that its heading, subheading, and action sit together in its header.

The settings pattern follows proven design guidelines that help your app feel native to the Shopify admin. See [Built for Shopify requirements](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements) for more details on these guidelines.

### Related Components (13) APIs (3) Compositions (3)

### Supported components

* [Badge](https://shopify.dev/docs/api/app-home/v2.0/web-components/feedback-and-status-indicators/badge)
* [Banner](https://shopify.dev/docs/api/app-home/v2.0/web-components/feedback-and-status-indicators/banner)
* [Box](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/box)
* [Divider](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/divider)
* [Grid](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/grid)
* [Heading](https://shopify.dev/docs/api/app-home/v2.0/web-components/typography-and-content/heading)
* [Icon](https://shopify.dev/docs/api/app-home/v2.0/web-components/media-and-visuals/icon)
* [Link](https://shopify.dev/docs/api/app-home/v2.0/web-components/actions/link)
* [Number field](https://shopify.dev/docs/api/app-home/v2.0/web-components/forms/number-field)
* [Section](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/section)
* [Stack](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/stack)
* [Switch](https://shopify.dev/docs/api/app-home/v2.0/web-components/forms/switch)
* [Text](https://shopify.dev/docs/api/app-home/v2.0/web-components/typography-and-content/text)

### Available APIs

* [Modal API](https://shopify.dev/docs/api/app-home/v2.0/apis/user-interface-and-interactions/modal-api)
* [Save Bar API](https://shopify.dev/docs/api/app-home/v2.0/apis/user-interface-and-interactions/save-bar-api)
* [Toast API](https://shopify.dev/docs/api/app-home/v2.0/apis/user-interface-and-interactions/toast-api)

### Recommended compositions

* [Account connection](https://shopify.dev/docs/api/app-home/v2.0/patterns/compositions/account-connection)
* [Footer help](https://shopify.dev/docs/api/app-home/v2.0/patterns/compositions/footer-help)
* [Interstitial nav](https://shopify.dev/docs/api/app-home/v2.0/patterns/compositions/interstitial-nav)

#### Use cases

* Configuring app behavior and preferences
* Managing notification settings and thresholds
* Organizing complex options into logical groups

***

## Examples

### Configure a settings page with toggles and contextual help

Merchants need to configure app behavior; the settings template groups options and protects unsaved changes. This example configures a settings page for a puzzle app. Each group of settings describes itself with `heading` and `subheading`, and the notifications section links to help documentation from an icon-only [button](https://shopify.dev/docs/api/app-home/latest/web-components/actions/button) in its [`accessory`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#sectionslots-propertydetail-accessory) slot. The connected account and each tool are nested sections, so the account's status sits in its [`supplemental`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#sectionslots-propertydetail-supplemental) slot, and every action sits in its section's header. A [divider](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/divider) separates the tools. The preferences section uses [`padding="none"`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#section-propertydetail-padding) and holds its links in a lightly padded [box](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/box), so they fill the card without a second border and keep room for their focus rings. Add `data-save-bar` to your form element to enable the [Save Bar API](https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/save-bar-api), which displays save and discard controls when the form has unsaved changes.

##### jsx

```tsx
// @validate-ignore: Argument of type 'EventTarget | null' is not assignable to parameter of type 'HTMLFormElement | undefined', Type 'null' is not assignable to type 'HTMLFormElement | undefined', Argument of type 'FormData' is not assignable to parameter of type 'Iterable<readonly [PropertyKey, any]>', Argument of type 'FormData' is not assignable to parameter of type 'Iterable<readonly any[]>'
<form
  data-save-bar
  onSubmit={(event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const formEntries = Object.fromEntries(formData);
    console.log("Form data", formEntries);
  }}
  onReset={(event) => {
    console.log("Handle discarded changes if necessary");
  }}
>
  <s-page heading="Settings" inlineSize="small">
    {/* === */}
    {/* Store information */}
    {/* Name each group of settings with heading, and explain what it controls with subheading. */}
    {/* === */}
    <s-section
      heading="Store information"
      subheading="Customers see these details on receipts and order notifications."
    >
      <s-text-field
        label="Store name"
        name="store-name"
        value="Puzzlify Store"
        placeholder="Enter store name"
      />
      <s-text-field
        label="Business address"
        name="business-address"
        value="123 Main St, Anytown, USA"
        placeholder="Enter business address"
      />
      <s-text-field
        label="Store phone"
        name="store-phone"
        value="+1 (555) 123-4567"
        placeholder="Enter phone number"
      />
      <s-choice-list label="Primary currency" name="currency">
        <s-choice value="usd" selected>
          US Dollar ($)
        </s-choice>
        <s-choice value="cad">Canadian Dollar (CAD)</s-choice>
        <s-choice value="eur">Euro (€)</s-choice>
      </s-choice-list>
    </s-section>

    {/* === */}
    {/* Notifications */}
    {/* The accessory slot holds content that qualifies the heading, like a link to help docs. */}
    {/* === */}
    <s-section
      heading="Notifications"
      subheading="Choose which updates you receive and how often they're sent."
    >
      <s-button
        slot="accessory"
        variant="tertiary"
        icon="info"
        href="https://help.shopify.com"
        target="_blank"
        accessibilityLabel="Learn more about notifications"
        interestFor="notifications-help-tooltip"
      />
      <s-tooltip slot="accessory" id="notifications-help-tooltip">
        Learn more about notifications
      </s-tooltip>
      <s-select
        label="Notification frequency"
        name="notification-frequency"
      >
        <s-option value="immediately" selected>
          Immediately
        </s-option>
        <s-option value="hourly">Hourly digest</s-option>
        <s-option value="daily">Daily digest</s-option>
      </s-select>
      <s-choice-list
        label="Notification types"
        name="notifications-type"
        multiple
      >
        <s-choice value="new-order" selected>
          New order notifications
        </s-choice>
        <s-choice value="low-stock">Low stock alerts</s-choice>
        <s-choice value="customer-review">
          Customer review notifications
        </s-choice>
        <s-choice value="shipping-updates">Shipping updates</s-choice>
      </s-choice-list>
    </s-section>

    {/* === */}
    {/* Connected accounts */}
    {/* Nest a section for each account, so its status and action sit in its own header. */}
    {/* === */}
    <s-section
      heading="Connected accounts"
      subheading="Connect an account to sync your puzzles and orders."
    >
      <s-section heading="Puzzlify">
        <s-badge slot="supplemental">Not connected</s-badge>
        <s-button slot="primary-action" variant="primary">
          Connect
        </s-button>
        <s-paragraph>
          By clicking Connect, you agree to accept Sample App's terms and
          conditions. You'll pay a commission rate of 15% on sales made through
          Sample App.
        </s-paragraph>
      </s-section>
    </s-section>

    {/* === */}
    {/* Preferences */}
    {/* With padding="none", a padded box holds the rows, so they fill the card without a second border and keep room for their focus rings. */}
    {/* === */}
    <s-section
      heading="Preferences"
      subheading="Manage settings for other parts of the app."
      padding="none"
    >
      <s-box padding="small-400">
        <s-clickable
          padding="small-100"
          borderRadius="base"
          href="/app/settings/shipping"
          accessibilityLabel="Configure shipping methods, rates, and fulfillment options"
        >
          <s-grid
            gridTemplateColumns="1fr auto"
            alignItems="center"
            gap="base"
          >
            <s-box>
              <s-heading>Shipping & fulfillment</s-heading>
              <s-paragraph color="subdued">
                Shipping methods, rates, zones, and fulfillment preferences.
              </s-paragraph>
            </s-box>
            <s-icon type="chevron-right" />
          </s-grid>
        </s-clickable>
        <s-box paddingInline="small-100">
          <s-divider />
        </s-box>
        <s-clickable
          padding="small-100"
          borderRadius="base"
          href="/app/settings/products_catalog"
          accessibilityLabel="Configure product defaults, customer experience, and catalog settings"
        >
          <s-grid
            gridTemplateColumns="1fr auto"
            alignItems="center"
            gap="base"
          >
            <s-box>
              <s-heading>Products & catalog</s-heading>
              <s-paragraph color="subdued">
                Product defaults, customer experience, and catalog display
                options.
              </s-paragraph>
            </s-box>
            <s-icon type="chevron-right" />
          </s-grid>
        </s-clickable>
        <s-box paddingInline="small-100">
          <s-divider />
        </s-box>
        <s-clickable
          padding="small-100"
          borderRadius="base"
          href="/app/settings/customer_support"
          accessibilityLabel="Manage customer support settings and help resources"
        >
          <s-grid
            gridTemplateColumns="1fr auto"
            alignItems="center"
            gap="base"
          >
            <s-box>
              <s-heading>Customer support</s-heading>
              <s-paragraph color="subdued">
                Support settings, help resources, and customer service
                tools.
              </s-paragraph>
            </s-box>
            <s-icon type="chevron-right" />
          </s-grid>
        </s-clickable>
      </s-box>
    </s-section>

    {/* === */}
    {/* Tools */}
    {/* Each tool is a nested section: heading and subheading describe it, its button sits in secondary-actions, and a divider separates it from the next tool. */}
    {/* === */}
    <s-section
      heading="Tools"
      subheading="Back up or reset your app configuration."
    >
      <s-section
        heading="Reset app settings"
        subheading="Reset all settings to their default values. This action can't be undone."
      >
        <s-button slot="secondary-actions" tone="critical">
          Reset
        </s-button>
      </s-section>
      <s-divider />
      <s-section
        heading="Export settings"
        subheading="Download a backup of all your current settings."
      >
        <s-button slot="secondary-actions">Export</s-button>
      </s-section>
    </s-section>

    {/* Footer help */}
    <s-stack alignItems="center" paddingBlock="large">
      <s-text color="subdued">
        Learn more about <s-link href="https://help.shopify.com" target="_blank">managing app settings</s-link>.
      </s-text>
    </s-stack>
  </s-page>
</form>
```

##### html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.shopify.com/shopifycloud/polaris-2.0.js"></script>
    <title>Pattern</title>
  </head>
  <body>
    <!-- === -->
    <!-- Settings page pattern -->
    <!-- === -->
    <form data-save-bar onSubmit="" onReset="">
      <s-page heading="Settings" inlineSize="small">
        <!-- === -->
        <!-- Store information -->
        <!-- Name each group of settings with heading, and explain what it controls with subheading. -->
        <!-- === -->
        <s-section
          heading="Store information"
          subheading="Customers see these details on receipts and order notifications."
        >
          <s-text-field
            label="Store name"
            name="store-name"
            value="Puzzlify Store"
            placeholder="Enter store name"
          ></s-text-field>
          <s-text-field
            label="Business address"
            name="business-address"
            value="123 Main St, Anytown, USA"
            placeholder="Enter business address"
          ></s-text-field>
          <s-text-field
            label="Store phone"
            name="store-phone"
            value="+1 (555) 123-4567"
            placeholder="Enter phone number"
          ></s-text-field>
          <s-choice-list label="Primary currency" name="currency">
            <s-choice value="usd" selected>US Dollar ($)</s-choice>
            <s-choice value="cad">Canadian Dollar (CAD)</s-choice>
            <s-choice value="eur">Euro (€)</s-choice>
          </s-choice-list>
        </s-section>
        <!-- === -->
        <!-- Notifications -->
        <!-- The accessory slot holds content that qualifies the heading, like a link to help docs. -->
        <!-- === -->
        <s-section
          heading="Notifications"
          subheading="Choose which updates you receive and how often they're sent."
        >
          <s-button
            slot="accessory"
            variant="tertiary"
            icon="info"
            href="https://help.shopify.com"
            target="_blank"
            accessibilityLabel="Learn more about notifications"
            interestFor="notifications-help-tooltip"
          ></s-button>
          <s-tooltip slot="accessory" id="notifications-help-tooltip">
            Learn more about notifications
          </s-tooltip>
          <s-select
            label="Notification frequency"
            name="notification-frequency"
          >
            <s-option value="immediately" selected>Immediately</s-option>
            <s-option value="hourly">Hourly digest</s-option>
            <s-option value="daily">Daily digest</s-option>
          </s-select>
          <s-choice-list
            label="Notification types"
            name="notifications-type"
            multiple
          >
            <s-choice value="new-order" selected
              >New order notifications</s-choice
            >
            <s-choice value="low-stock">Low stock alerts</s-choice>
            <s-choice value="customer-review"
              >Customer review notifications</s-choice
            >
            <s-choice value="shipping-updates">Shipping updates</s-choice>
          </s-choice-list>
        </s-section>
        <!-- === -->
        <!-- Connected accounts -->
        <!-- Nest a section for each account, so its status and action sit in its own header. -->
        <!-- === -->
        <s-section
          heading="Connected accounts"
          subheading="Connect an account to sync your puzzles and orders."
        >
          <s-section heading="Puzzlify">
            <s-badge slot="supplemental">Not connected</s-badge>
            <s-button slot="primary-action" variant="primary">Connect</s-button>
            <s-paragraph>
              By clicking Connect, you agree to accept Sample App's terms and
              conditions. You'll pay a commission rate of 15% on sales made through
              Sample App.
            </s-paragraph>
          </s-section>
        </s-section>
        <!-- === -->
        <!-- Preferences -->
        <!-- With padding="none", a padded box holds the rows, so they fill the card without a second border and keep room for their focus rings. -->
        <!-- === -->
        <s-section
          heading="Preferences"
          subheading="Manage settings for other parts of the app."
          padding="none"
        >
          <s-box padding="small-400">
            <s-clickable
              padding="small-100"
              borderRadius="base"
              href="/app/settings/shipping"
              accessibilityLabel="Configure shipping methods, rates, and fulfillment options"
            >
              <s-grid
                gridTemplateColumns="1fr auto"
                alignItems="center"
                gap="base"
              >
                <s-box>
                  <s-heading>Shipping & fulfillment</s-heading>
                  <s-paragraph color="subdued">
                    Shipping methods, rates, zones, and fulfillment preferences.
                  </s-paragraph>
                </s-box>
                <s-icon type="chevron-right"></s-icon>
              </s-grid>
            </s-clickable>
            <s-box paddingInline="small-100">
              <s-divider></s-divider>
            </s-box>
            <s-clickable
              padding="small-100"
              borderRadius="base"
              href="/app/settings/products_catalog"
              accessibilityLabel="Configure product defaults, customer experience, and catalog settings"
            >
              <s-grid
                gridTemplateColumns="1fr auto"
                alignItems="center"
                gap="base"
              >
                <s-box>
                  <s-heading>Products & catalog</s-heading>
                  <s-paragraph color="subdued">
                    Product defaults, customer experience, and catalog display
                    options.
                  </s-paragraph>
                </s-box>
                <s-icon type="chevron-right"></s-icon>
              </s-grid>
            </s-clickable>
            <s-box paddingInline="small-100">
              <s-divider></s-divider>
            </s-box>
            <s-clickable
              padding="small-100"
              borderRadius="base"
              href="/app/settings/customer_support"
              accessibilityLabel="Manage customer support settings and help resources"
            >
              <s-grid
                gridTemplateColumns="1fr auto"
                alignItems="center"
                gap="base"
              >
                <s-box>
                  <s-heading>Customer support</s-heading>
                  <s-paragraph color="subdued">
                    Support settings, help resources, and customer service
                    tools.
                  </s-paragraph>
                </s-box>
                <s-icon type="chevron-right"></s-icon>
              </s-grid>
            </s-clickable>
          </s-box>
        </s-section>
        <!-- === -->
        <!-- Tools -->
        <!-- Each tool is a nested section: heading and subheading describe it, its button sits in secondary-actions, and a divider separates it from the next tool. -->
        <!-- === -->
        <s-section
          heading="Tools"
          subheading="Back up or reset your app configuration."
        >
          <s-section
            heading="Reset app settings"
            subheading="Reset all settings to their default values. This action can't be undone."
          >
            <s-button slot="secondary-actions" tone="critical">Reset</s-button>
          </s-section>
          <s-divider></s-divider>
          <s-section
            heading="Export settings"
            subheading="Download a backup of all your current settings."
          >
            <s-button slot="secondary-actions">Export</s-button>
          </s-section>
        </s-section>

        <!-- Footer help -->
        <s-stack alignItems="center" paddingBlock="large">
          <s-text color="subdued">
            Learn more about <s-link href="https://help.shopify.com" target="_blank">managing app settings</s-link>.
          </s-text>
        </s-stack>
      </s-page>
    </form>
  </body>
</html>
```

### Confirm reset with Modal API

Use the [Modal API](https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/modal-api) to confirm destructive actions like resetting all settings to their default values. The tool's [`secondary-actions`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#sectionslots-propertydetail-secondaryactions) slot holds **Reset**, which opens the modal with [`commandFor`](https://shopify.dev/docs/api/app-home/latest/web-components/actions/button#button-propertydetail-commandfor).

##### jsx

```tsx
<s-section heading="Tools">
  <s-section
    heading="Reset app settings"
    subheading="Reset all settings to their default values. This action can't be undone."
  >
    <s-button
      slot="secondary-actions"
      tone="critical"
      commandFor="reset-modal"
      command="--show"
    >
      Reset
    </s-button>
  </s-section>

  <s-modal id="reset-modal" heading="Reset all settings?">
    <s-stack direction="block" gap="base">
      <s-text>
        Are you sure you want to reset all settings to their default values? This will clear all your customizations and cannot be undone.
      </s-text>
      <s-banner tone="warning">
        <s-text>
          This will reset notification preferences, connected accounts, and all other configurations.
        </s-text>
      </s-banner>
    </s-stack>
    <s-button
      slot="primary-action"
      variant="primary"
      tone="critical"
      onClick={() => {
        shopify.toast.show('Settings reset to defaults');
      }}
    >
      Reset settings
    </s-button>
    <s-button
      slot="secondary-actions"
      commandFor="reset-modal"
      command="--hide"
    >
      Cancel
    </s-button>
  </s-modal>
</s-section>
```

##### html

```html
<s-section heading="Tools">
  <s-section
    heading="Reset app settings"
    subheading="Reset all settings to their default values. This action can't be undone."
  >
    <s-button
      slot="secondary-actions"
      tone="critical"
      commandFor="reset-modal"
      command="--show"
    >Reset</s-button>
  </s-section>

  <s-modal id="reset-modal" heading="Reset all settings?">
    <s-stack direction="block" gap="base">
      <s-text>
        Are you sure you want to reset all settings to their default values? This will clear all your customizations and cannot be undone.
      </s-text>
      <s-banner tone="warning">
        <s-text>
          This will reset notification preferences, connected accounts, and all other configurations.
        </s-text>
      </s-banner>
    </s-stack>
    <s-button
      slot="primary-action"
      variant="primary"
      tone="critical"
      onClick="shopify.toast.show('Settings reset to defaults')"
    >Reset settings</s-button>
    <s-button
      slot="secondary-actions"
      commandFor="reset-modal"
      command="--hide"
    >Cancel</s-button>
  </s-modal>
</s-section>
```

### Show save feedback with Toast API

Use the [Toast API](https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/toast-api) to show feedback when settings are saved. Combine with the Save Bar API for a complete form experience.

##### jsx

```tsx
// @validate-ignore: Argument of type 'EventTarget | null' is not assignable to parameter of type 'HTMLFormElement | undefined', Type 'null' is not assignable to type 'HTMLFormElement | undefined', Argument of type 'FormData' is not assignable to parameter of type 'Iterable<readonly [PropertyKey, any]>', Argument of type 'FormData' is not assignable to parameter of type 'Iterable<readonly any[]>'
<form
  data-save-bar
  onSubmit={(event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const formEntries = Object.fromEntries(formData);
    console.log("Form data", formEntries);
    shopify.toast.show('Settings saved successfully');
  }}
  onReset={(event) => {
    console.log("Handle discarded changes if necessary");
  }}
>
  <s-section
    heading="Notifications"
    subheading="Choose which updates you receive and how often they're sent."
  >
    <s-select
      label="Notification frequency"
      name="notification-frequency"
    >
      <s-option value="immediately" selected>Immediately</s-option>
      <s-option value="hourly">Hourly digest</s-option>
      <s-option value="daily">Daily digest</s-option>
    </s-select>
    <s-choice-list
      label="Notification types"
      name="notifications-type"
      multiple
    >
      <s-choice value="new-order" selected>New order notifications</s-choice>
      <s-choice value="low-stock">Low stock alerts</s-choice>
      <s-choice value="customer-review">Customer review notifications</s-choice>
    </s-choice-list>
  </s-section>
</form>
```

##### html

```html
<script>
  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const formEntries = Object.fromEntries(formData);
    console.log("Form data", formEntries);
    shopify.toast.show('Settings saved successfully');
  }
  function handleReset(event) {
    console.log("Handle discarded changes if necessary");
  }
</script>
<form
  data-save-bar
  onSubmit="handleSubmit(event)"
  onReset="handleReset(event)"
>
  <s-section
    heading="Notifications"
    subheading="Choose which updates you receive and how often they're sent."
  >
    <s-select
      label="Notification frequency"
      name="notification-frequency"
    >
      <s-option value="immediately" selected>Immediately</s-option>
      <s-option value="hourly">Hourly digest</s-option>
      <s-option value="daily">Daily digest</s-option>
    </s-select>
    <s-choice-list
      label="Notification types"
      name="notifications-type"
      multiple
    >
      <s-choice value="new-order" selected>New order notifications</s-choice>
      <s-choice value="low-stock">Low stock alerts</s-choice>
      <s-choice value="customer-review">Customer review notifications</s-choice>
    </s-choice-list>
  </s-section>
</form>
```

***
