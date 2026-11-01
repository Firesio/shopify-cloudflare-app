---
title: Homepage
description: >-
  The first thing merchants see when they open your app in App Home is a landing
  page, associated with the route file app._index.jsx in React Router-based
  Shopify apps. It provides a clear entry point for merchants, and an
  opportunity to provide daily value through status updates, metrics, and clear
  actions merchants can take.
api_version: v2.0
source_url:
  html: 'https://shopify.dev/docs/api/app-home/latest/patterns/templates/homepage'
  md: 'https://shopify.dev/docs/api/app-home/latest/patterns/templates/homepage.md'
api_name: app-home
---

# Homepage

The first thing merchants see when they open your app in App Home is a landing page, associated with the route file `app._index.jsx` in React Router-based Shopify apps.

It provides a clear entry point for merchants, and an opportunity to provide daily value through status updates, metrics, and clear actions merchants can take. Surface key information at a glance like performance metrics, items needing attention, and onboarding guidance for new users.

Build each card on the page as a [section](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section), and put anything that describes or acts on a whole card in its header rather than its body. Name each section with [`heading`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#section-propertydetail-heading), and add supporting text with [`subheading`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#section-propertydetail-subheading). Use the [`supplemental`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#sectionslots-propertydetail-supplemental) slot for the card's status, such as setup progress, and the [`secondary-actions`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#sectionslots-propertydetail-secondaryactions) slot for its actions, such as a link to see more or a dismiss button. A section without a visible heading, such as a row of metrics, still needs an [`accessibilityLabel`](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section#section-propertydetail-accessibilitylabel).

Put lists such as setup steps and news straight into the section, with a [divider](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/divider) between rows instead of a box around each one. Keep bordered tiles for items that stand on their own in a grid, such as templates and apps.

The homepage pattern provides this foundation while following proven design guidelines that help your app feel native to the Shopify admin. See [Built for Shopify requirements](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements) for more details on these guidelines for apps.

### Related Components (14) APIs (2) Compositions (5)

### Supported components

* [Badge](https://shopify.dev/docs/api/app-home/v2.0/web-components/feedback-and-status-indicators/badge)
* [Banner](https://shopify.dev/docs/api/app-home/v2.0/web-components/feedback-and-status-indicators/banner)
* [Box](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/box)
* [Button](https://shopify.dev/docs/api/app-home/v2.0/web-components/actions/button)
* [Clickable](https://shopify.dev/docs/api/app-home/v2.0/web-components/actions/clickable)
* [Divider](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/divider)
* [Grid](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/grid)
* [Heading](https://shopify.dev/docs/api/app-home/v2.0/web-components/typography-and-content/heading)
* [Icon](https://shopify.dev/docs/api/app-home/v2.0/web-components/media-and-visuals/icon)
* [Link](https://shopify.dev/docs/api/app-home/v2.0/web-components/actions/link)
* [Paragraph](https://shopify.dev/docs/api/app-home/v2.0/web-components/typography-and-content/paragraph)
* [Section](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/section)
* [Stack](https://shopify.dev/docs/api/app-home/v2.0/web-components/layout-and-structure/stack)
* [Text](https://shopify.dev/docs/api/app-home/v2.0/web-components/typography-and-content/text)

### Available APIs

* [Navigation API](https://shopify.dev/docs/api/app-home/v2.0/apis/user-interface-and-interactions/navigation-api)
* [Toast API](https://shopify.dev/docs/api/app-home/v2.0/apis/user-interface-and-interactions/toast-api)

### Recommended compositions

* [App card](https://shopify.dev/docs/api/app-home/v2.0/patterns/compositions/app-card)
* [Callout card](https://shopify.dev/docs/api/app-home/v2.0/patterns/compositions/callout-card)
* [Media card](https://shopify.dev/docs/api/app-home/v2.0/patterns/compositions/media-card)
* [Setup guide](https://shopify.dev/docs/api/app-home/v2.0/patterns/compositions/setup-guide)
* [Footer help](https://shopify.dev/docs/api/app-home/v2.0/patterns/compositions/footer-help)

#### Use cases

* Providing a dashboard with key metrics and status updates
* Surfacing items that need merchant attention
* Guiding new users through onboarding steps

***

## Examples

### Surface a homepage with score banner, metrics, and product list

Merchants need a clear entry point with key information and actions. This example surfaces a homepage for a puzzle app with an upgrade banner, a setup guide, metrics, a callout card, puzzle templates, news, and featured apps.

The setup guide reports its progress in the `supplemental` slot, and the setup guide, callout card, and featured apps sections each put an icon-only dismiss [button](https://shopify.dev/docs/api/app-home/latest/web-components/actions/button) in their `secondary-actions` slot, named by its [`accessibilityLabel`](https://shopify.dev/docs/api/app-home/latest/web-components/actions/button#button-propertydetail-accessibilitylabel).

The templates and news sections link to their full lists from the same slot, and the metrics section, which has no visible heading, is named by its `accessibilityLabel`. Setup steps and news items are rows separated by dividers, and templates and featured apps are individual tiles in a responsive grid. Each app tile is one [clickable](https://shopify.dev/docs/api/app-home/latest/web-components/actions/clickable), so it holds no button of its own.

##### jsx

```tsx
// @framework-globals: useState
const steps = [
  {
    id: 'upload-image',
    label: 'Upload an image for your puzzle',
    description:
      'Start by uploading a high-quality image that will be used to create your puzzle. For best results, use images that are at least 1200x1200 pixels.',
    primaryAction: 'Upload image',
    secondaryAction: 'Image requirements',
  },
  {
    id: 'choose-template',
    label: 'Choose a puzzle template',
    description:
      'Select a template for your puzzle - choose between 9-piece (beginner), 16-piece (intermediate), or 25-piece (advanced) layouts.',
    primaryAction: 'Choose template',
    secondaryAction: 'See all templates',
  },
  {
    id: 'customize-pieces',
    label: 'Customize puzzle piece shapes',
    description:
      'Make your puzzle unique by customizing the shapes of individual pieces. Choose from classic, curved, or themed piece styles.',
    primaryAction: 'Customize pieces',
    secondaryAction: 'Learn about piece styles',
  },
];

const templates = [
  {id: '4-piece', name: '4-Pieces', image: 'https://cdn.shopify.com/static/images/polaris/patterns/4-pieces.png'},
  {id: '9-piece', name: '9-Pieces', image: 'https://cdn.shopify.com/static/images/polaris/patterns/9-pieces.png'},
  {id: '16-piece', name: '16-Pieces', image: 'https://cdn.shopify.com/static/images/polaris/patterns/16-pieces.png'},
];

const news = [
  {
    id: 'new-shapes-and-themes',
    date: 'Jan 21, 2025',
    title: 'New puzzle shapes and themes added',
    summary:
      "We've added 5 new puzzle piece shapes and 3 seasonal themes to help you create more engaging and unique puzzles for your customers.",
  },
  {
    id: 'puzzle-difficulty-customization',
    date: 'Nov 6, 2024',
    title: 'Puzzle difficulty customization features',
    summary:
      'Now you can fine-tune the difficulty of your puzzles with new rotation controls, edge highlighting options, and piece recognition settings.',
  },
];

const apps = [
  {
    name: 'Shopify Flow',
    href: 'https://apps.shopify.com/flow',
    icon: 'https://cdn.shopify.com/app-store/listing_images/15100ebca4d221b650a7671125cd1444/icon/CO25r7-jh4ADEAE=.png',
    description: 'Automate everything and get back to business.',
  },
  {
    name: 'Shopify Planet',
    href: 'https://apps.shopify.com/planet',
    icon: 'https://cdn.shopify.com/app-store/listing_images/87176a11f3714753fdc2e1fc8bbf0415/icon/CIqiqqXsiIADEAE=.png',
    description: 'Offer carbon-neutral shipping and showcase your commitment.',
  },
];

const [visible, setVisible] = useState({
  banner: true,
  setupGuide: true,
  calloutCard: true,
  featuredApps: true,
});
const [expanded, setExpanded] = useState({});
const [completed, setCompleted] = useState({});
const completedCount = steps.filter((step) => completed[step.id]).length;

return (
  <s-page>
      <s-button slot="primary-action" variant="primary">Create puzzle</s-button>
      <s-button slot="secondary-actions">Browse templates</s-button>
      <s-button slot="secondary-actions">Import image</s-button>

      {/* === */}
      {/* Banner */}
      {/* Use banners sparingly. Only one banner should be visible at a time. */}
      {/* If dismissed, use local storage or a database entry to avoid showing this section again to the same user. */}
      {/* === */}
      {visible.banner && (
        <s-banner
          dismissible
          onDismiss={() => setVisible({ ...visible, banner: false })}
        >
          3 of 5 puzzles created.{" "}
          <s-link href="#">Upgrade to Puzzlify Pro</s-link> to create unlimited
          puzzles.
        </s-banner>
      )}

      {/* === */}
      {/* Setup guide */}
      {/* Keep instructions brief and direct. Only ask merchants for required information. */}
      {/* The header holds the guide's progress in the supplemental slot and its dismiss button in the secondary-actions slot. */}
      {/* Steps sit directly in the card, separated by dividers. A step's details open beneath it, in line with its label, without a box of their own. */}
      {/* If dismissed, use local storage or a database entry to avoid showing this section again to the same user. */}
      {/* === */}
      {visible.setupGuide && (
        <s-section
          heading="Setup guide"
          subheading="Use this personalized guide to get your store ready for sales."
        >
          <s-text slot="supplemental" color="subdued">
            {completedCount} of {steps.length} steps completed
          </s-text>
          <s-button
            slot="secondary-actions"
            accessibilityLabel="Dismiss guide"
            onClick={() => setVisible({ ...visible, setupGuide: false })}
            variant="tertiary"
            tone="neutral"
            icon="x"
          ></s-button>
          <s-stack gap="small">
            {steps.map((step, index) => (
              <s-stack key={step.id} gap="small">
                {index > 0 && <s-divider />}
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  alignItems="center"
                >
                  <s-checkbox
                    label={step.label}
                    checked={Boolean(completed[step.id])}
                    onInput={(e) =>
                      setCompleted({ ...completed, [step.id]: e.currentTarget.checked })
                    }
                  ></s-checkbox>
                  <s-button
                    onClick={() =>
                      setExpanded({ ...expanded, [step.id]: !expanded[step.id] })
                    }
                    accessibilityLabel={`Toggle ${step.label} details`}
                    variant="tertiary"
                    icon={expanded[step.id] ? "chevron-up" : "chevron-down"}
                  ></s-button>
                </s-grid>
                {expanded[step.id] && (
                  <s-grid
                    gridTemplateColumns="1fr auto"
                    gap="base"
                    alignItems="center"
                    paddingInlineStart="large-200"
                  >
                    <s-stack gap="small-200">
                      <s-paragraph color="subdued">{step.description}</s-paragraph>
                      <s-stack direction="inline" gap="small-200">
                        <s-button variant="primary">{step.primaryAction}</s-button>
                        <s-button variant="tertiary" tone="neutral">
                          {step.secondaryAction}
                        </s-button>
                      </s-stack>
                    </s-stack>
                    <s-box maxBlockSize="80px" maxInlineSize="80px">
                      <s-image
                        src="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
                        alt=""
                      />
                    </s-box>
                  </s-grid>
                )}
              </s-stack>
            ))}
            {/* Add steps to the array above to add them to the guide */}
          </s-stack>
        </s-section>
      )}

      {/* === */}
      {/* Metrics cards */}
      {/* Your app homepage should provide merchants with quick statistics or status updates that help them understand how the app is performing for them. */}
      {/* A section with no visible heading still needs a name, so give it an accessibilityLabel. */}
      {/* === */}
      <s-section padding="base" accessibilityLabel="Puzzle metrics">
        <s-grid
          gridTemplateColumns="@container (inline-size <= 400px) 1fr, 1fr auto 1fr auto 1fr"
          gap="small"
        >
          <s-clickable
            href="#"
            paddingBlock="small-400"
            paddingInline="small-100"
            borderRadius="base"
          >
            <s-grid gap="small-300">
              <s-heading>Total Designs</s-heading>
              <s-stack direction="inline" gap="small-200">
                <s-text>156</s-text>
                <s-badge tone="success" icon="arrow-up">
                  12%
                </s-badge>
              </s-stack>
            </s-grid>
          </s-clickable>
          <s-divider direction="block" />
          <s-clickable
            href="#"
            paddingBlock="small-400"
            paddingInline="small-100"
            borderRadius="base"
          >
            <s-grid gap="small-300">
              <s-heading>Units Sold</s-heading>
              <s-stack direction="inline" gap="small-200">
                <s-text>2,847</s-text>
                <s-badge tone="warning">0%</s-badge>
              </s-stack>
            </s-grid>
          </s-clickable>
          <s-divider direction="block" />
          <s-clickable
            href="#"
            paddingBlock="small-400"
            paddingInline="small-100"
            borderRadius="base"
          >
            <s-grid gap="small-300">
              <s-heading>Return Rate</s-heading>
              <s-stack direction="inline" gap="small-200">
                <s-text>3.2%</s-text>
                <s-badge tone="critical" icon="arrow-down">
                  0.8%
                </s-badge>
              </s-stack>
            </s-grid>
          </s-clickable>
        </s-grid>
      </s-section>

      {/* === */}
      {/* Callout card */}
      {/* The dismiss button sits in the header's secondary-actions slot, beside the heading it dismisses. */}
      {/* If dismissed, use local storage or a database entry to avoid showing this section again to the same user. */}
      {/* === */}
      {visible.calloutCard && (
        <s-section heading="Ready to create your custom puzzle?">
          <s-button
            slot="secondary-actions"
            onClick={() => setVisible({ ...visible, calloutCard: false })}
            icon="x"
            tone="neutral"
            variant="tertiary"
            accessibilityLabel="Dismiss card"
          ></s-button>
          <s-grid
            gridTemplateColumns="@container (inline-size <= 480px) 1fr, auto auto"
            gap="base"
            alignItems="center"
          >
            <s-grid gap="small-200">
              <s-paragraph>
                Start by uploading an image to your gallery or choose from one
                of our templates.
              </s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-button>Upload image</s-button>
                <s-button tone="neutral" variant="tertiary">
                  Browse templates
                </s-button>
              </s-stack>
            </s-grid>
            <s-stack alignItems="center">
              <s-box maxInlineSize="200px">
                <s-image
                  src="https://cdn.shopify.com/static/images/polaris/patterns/callout.png"
                  alt="Customize checkout illustration"
                  aspectRatio="1/0.5"
                  borderRadius="base"
                />
              </s-box>
            </s-stack>
          </s-grid>
        </s-section>
      )}

      {/* === */}
      {/* Puzzle templates */}
      {/* The link to every template is the section's action, so it sits in the secondary-actions slot. */}
      {/* Each template is its own tile, so its image and its View action read as one item. */}
      {/* === */}
      <s-section heading="Puzzle templates">
        <s-button slot="secondary-actions" href="/puzzles">
          See all templates
        </s-button>
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(155px, 1fr))"
          gap="base"
        >
          {templates.map((template) => (
            <s-box
              key={template.id}
              border="base"
              borderRadius="base"
              overflow="hidden"
            >
              <s-clickable
                href={`/puzzles/${template.id}`}
                accessibilityLabel={`${template.name} puzzle template`}
              >
                <s-image
                  aspectRatio="1/1"
                  objectFit="cover"
                  alt={`${template.name} puzzle template`}
                  src={template.image}
                />
              </s-clickable>
              <s-divider />
              <s-grid
                gridTemplateColumns="1fr auto"
                padding="small"
                gap="small"
                alignItems="center"
              >
                <s-heading>{template.name}</s-heading>
                <s-button
                  href={`/puzzles/${template.id}`}
                  accessibilityLabel={`View ${template.name} puzzle template`}
                >
                  View
                </s-button>
              </s-grid>
            </s-box>
          ))}
        </s-grid>
      </s-section>

      {/* === */}
      {/* News */}
      {/* News items are rows separated by dividers, rather than bordered boxes inside the card. */}
      {/* === */}
      <s-section heading="News">
        <s-button slot="secondary-actions" href="/news">
          See all news
        </s-button>
        <s-stack gap="base">
          {news.map((item, index) => (
            <s-stack key={item.id} gap="base">
              {index > 0 && <s-divider />}
              <s-stack gap="small-400">
                <s-text color="subdued">{item.date}</s-text>
                <s-link href={`/news/${item.id}`}>
                  <s-heading>{item.title}</s-heading>
                </s-link>
                <s-paragraph>{item.summary}</s-paragraph>
              </s-stack>
            </s-stack>
          ))}
        </s-stack>
      </s-section>

      {/* === */}
      {/* Featured apps */}
      {/* Each app is its own tile, two to a row on wider screens. The whole tile is the link, so it holds no button of its own. */}
      {/* If dismissed, use local storage or a database entry to avoid showing this section again to the same user. */}
      {/* === */}
      {visible.featuredApps && (
        <s-section heading="Featured apps">
          <s-button
            slot="secondary-actions"
            onClick={() => setVisible({ ...visible, featuredApps: false })}
            icon="x"
            tone="neutral"
            variant="tertiary"
            accessibilityLabel="Dismiss featured apps"
          ></s-button>
          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))"
            gap="base"
          >
            {apps.map((app) => (
              <s-clickable
                key={app.href}
                href={app.href}
                target="_blank"
                border="base"
                borderRadius="base"
                padding="base"
                accessibilityLabel={`Get ${app.name} on the Shopify App Store`}
              >
                <s-grid
                  gridTemplateColumns="auto 1fr auto"
                  alignItems="start"
                  gap="base"
                >
                  <s-thumbnail size="small" src={app.icon} alt="" />
                  <s-box>
                    <s-heading>{app.name}</s-heading>
                    <s-paragraph color="subdued">Free</s-paragraph>
                    <s-paragraph color="subdued">{app.description}</s-paragraph>
                  </s-box>
                  <s-icon type="external" />
                </s-grid>
              </s-clickable>
            ))}
          </s-grid>
        </s-section>
      )}

    {/* Footer help */}
    <s-stack alignItems="center" paddingBlock="large">
      <s-text color="subdued">
        Learn more about <s-link href="https://help.shopify.com" target="_blank">creating engaging puzzles</s-link>.
      </s-text>
    </s-stack>
</s-page>
)
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
    <script>
      // Simple global object to store handlers
      window.puzzleApp = {
        progress: 0,

        // Banner handlers
        dismissBanner: function(bannerElement) {
          if (bannerElement) {
            bannerElement.style.display = 'none';
          }
        },

        // Guide handlers
        dismissGuide: function(guideSection) {
          if (guideSection) {
            guideSection.style.display = 'none';
          }
        },

        // Step handlers
        toggleStep: function(button, detailsContainer) {
          if (button && detailsContainer) {
            const isExpanded = detailsContainer.style.display !== 'none';
            detailsContainer.style.display = isExpanded ? 'none' : '';
            button.setAttribute('icon', isExpanded ? 'chevron-down' : 'chevron-up');
          }
        },

        // Checkbox handlers
        updateProgress: function(checkbox, progressElement) {
          if (checkbox && progressElement) {
            this.progress += checkbox.checked ? 1 : -1;
            progressElement.textContent = `${this.progress} of 3 steps completed`;
          }
        },

        // Section dismissal handlers
        dismissSection: function(section) {
          if (section) {
            section.style.display = 'none';
          }
        }
      };
    </script>
  </head>
  <body>
    <!-- === -->
    <!-- Home page pattern -->
    <!-- === -->
    <s-page>
      <s-button slot="primary-action" variant="primary">Create puzzle</s-button>
      <s-button slot="secondary-actions">Browse templates</s-button>
      <s-button slot="secondary-actions">Import image</s-button>
      <!-- === -->
      <!-- Banner -->
      <!-- Use banners sparingly. Only one banner should be visible at a time. -->
      <!-- If dismissed, use local storage or a database entry to avoid showing this section again to the same user. -->
      <!-- === -->
      <s-banner
        id="upgrade-banner"
        dismissible
        onDismiss="window.puzzleApp.dismissBanner(this)"
      >
        3 of 5 puzzles created.
        <s-link href="#">Upgrade to Puzzlify Pro</s-link> to create unlimited puzzles.
      </s-banner>
      <!-- === -->
      <!-- Setup guide -->
      <!-- Keep instructions brief and direct. Only ask merchants for required information. -->
      <!-- The header holds the guide's progress in the supplemental slot and its dismiss button in the secondary-actions slot. -->
      <!-- Steps sit directly in the card, separated by dividers. A step's details open beneath it, in line with its label, without a box of their own. -->
      <!-- If dismissed, use local storage or a database entry to avoid showing this section again to the same user. -->
      <!-- === -->
      <s-section
        id="setup-guide-section"
        heading="Setup guide"
        subheading="Use this personalized guide to get your store ready for sales."
      >
        <s-text slot="supplemental" id="progress-text" color="subdued">0 of 3 steps completed</s-text>
        <s-button
          slot="secondary-actions"
          accessibilityLabel="Dismiss guide"
          onClick="window.puzzleApp.dismissGuide(document.getElementById('setup-guide-section'))"
          variant="tertiary"
          tone="neutral"
          icon="x"
        ></s-button>
        <s-stack gap="small">
          <!-- Step 1 -->
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-checkbox
              label="Upload an image for your puzzle"
              onInput="window.puzzleApp.updateProgress(this, document.getElementById('progress-text'))"
            ></s-checkbox>
            <s-button
              onClick="window.puzzleApp.toggleStep(this, document.getElementById('step1-details'))"
              accessibilityLabel="Toggle Upload an image for your puzzle details"
              variant="tertiary"
              icon="chevron-down"
            ></s-button>
          </s-grid>
          <s-grid
            id="step1-details"
            gridTemplateColumns="1fr auto"
            gap="base"
            alignItems="center"
            paddingInlineStart="large-200"
            style="display: none;"
          >
            <s-stack gap="small-200">
              <s-paragraph color="subdued">
                Start by uploading a high-quality image that will be used to create your
                puzzle. For best results, use images that are at least 1200x1200 pixels.
              </s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-button variant="primary">Upload image</s-button>
                <s-button variant="tertiary" tone="neutral">Image requirements</s-button>
              </s-stack>
            </s-stack>
            <s-box maxBlockSize="80px" maxInlineSize="80px">
              <s-image
                src="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
                alt=""
              ></s-image>
            </s-box>
          </s-grid>
          <!-- Step 2 -->
          <s-divider></s-divider>
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-checkbox
              label="Choose a puzzle template"
              onInput="window.puzzleApp.updateProgress(this, document.getElementById('progress-text'))"
            ></s-checkbox>
            <s-button
              onClick="window.puzzleApp.toggleStep(this, document.getElementById('step2-details'))"
              accessibilityLabel="Toggle Choose a puzzle template details"
              variant="tertiary"
              icon="chevron-down"
            ></s-button>
          </s-grid>
          <s-grid
            id="step2-details"
            gridTemplateColumns="1fr auto"
            gap="base"
            alignItems="center"
            paddingInlineStart="large-200"
            style="display: none;"
          >
            <s-stack gap="small-200">
              <s-paragraph color="subdued">
                Select a template for your puzzle - choose between 9-piece (beginner),
                16-piece (intermediate), or 25-piece (advanced) layouts.
              </s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-button variant="primary">Choose template</s-button>
                <s-button variant="tertiary" tone="neutral">See all templates</s-button>
              </s-stack>
            </s-stack>
            <s-box maxBlockSize="80px" maxInlineSize="80px">
              <s-image
                src="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
                alt=""
              ></s-image>
            </s-box>
          </s-grid>
          <!-- Step 3 -->
          <s-divider></s-divider>
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-checkbox
              label="Customize puzzle piece shapes"
              onInput="window.puzzleApp.updateProgress(this, document.getElementById('progress-text'))"
            ></s-checkbox>
            <s-button
              onClick="window.puzzleApp.toggleStep(this, document.getElementById('step3-details'))"
              accessibilityLabel="Toggle Customize puzzle piece shapes details"
              variant="tertiary"
              icon="chevron-down"
            ></s-button>
          </s-grid>
          <s-grid
            id="step3-details"
            gridTemplateColumns="1fr auto"
            gap="base"
            alignItems="center"
            paddingInlineStart="large-200"
            style="display: none;"
          >
            <s-stack gap="small-200">
              <s-paragraph color="subdued">
                Make your puzzle unique by customizing the shapes of individual pieces.
                Choose from classic, curved, or themed piece styles.
              </s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-button variant="primary">Customize pieces</s-button>
                <s-button variant="tertiary" tone="neutral">Learn about piece styles</s-button>
              </s-stack>
            </s-stack>
            <s-box maxBlockSize="80px" maxInlineSize="80px">
              <s-image
                src="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
                alt=""
              ></s-image>
            </s-box>
          </s-grid>
          <!-- Add additional steps here... -->
        </s-stack>
      </s-section>
      <!-- === -->
      <!-- Metrics cards -->
      <!-- Your app homepage should provide merchants with quick statistics or status updates that help them understand how the app is performing for them. -->
      <!-- A section with no visible heading still needs a name, so give it an accessibilityLabel. -->
      <!-- === -->
      <s-section accessibilityLabel="Puzzle metrics">
          <s-grid
            gridTemplateColumns="@container (inline-size <= 400px) 1fr, 1fr auto 1fr auto 1fr"
            gap="small"
          >
            <s-clickable
              href="#"
              paddingBlock="small-400"
              paddingInline="small-100"
              borderRadius="base"
            >
              <s-grid gap="small-300">
                <s-heading>Total Designs</s-heading>
                <s-stack direction="inline" gap="small-200">
                  <s-text>156</s-text>
                  <s-badge tone="success" icon="arrow-up"> 12% </s-badge>
                </s-stack>
              </s-grid>
            </s-clickable>
            <s-divider direction="block"></s-divider>
            <s-clickable
              href="#"
              paddingBlock="small-400"
              paddingInline="small-100"
              borderRadius="base"
            >
              <s-grid gap="small-300">
                <s-heading>Units Sold</s-heading>
                <s-stack direction="inline" gap="small-200">
                  <s-text>2,847</s-text>
                  <s-badge tone="warning">0%</s-badge>
                </s-stack>
              </s-grid>
            </s-clickable>
            <s-divider direction="block"></s-divider>
            <s-clickable
              href="#"
              paddingBlock="small-400"
              paddingInline="small-100"
              borderRadius="base"
            >
              <s-grid gap="small-300">
                <s-heading>Return Rate</s-heading>
                <s-stack direction="inline" gap="small-200">
                  <s-text>3.2%</s-text>
                  <s-badge tone="critical" icon="arrow-down"> 0.8% </s-badge>
                </s-stack>
              </s-grid>
            </s-clickable>
          </s-grid>
      </s-section>
      <!-- === -->
      <!-- Callout card -->
      <!-- The dismiss button sits in the header's secondary-actions slot, beside the heading it dismisses. -->
      <!-- If dismissed, use local storage or a database entry to avoid showing this section again to the same user. -->
      <!-- === -->
      <s-section id="callout-section" heading="Ready to create your custom puzzle?">
        <s-button
          slot="secondary-actions"
          onClick="window.puzzleApp.dismissSection(document.getElementById('callout-section'))"
          icon="x"
          tone="neutral"
          variant="tertiary"
          accessibilityLabel="Dismiss card"
        ></s-button>
        <s-grid
          gridTemplateColumns="@container (inline-size <= 480px) 1fr, auto auto"
          gap="base"
          alignItems="center"
        >
          <s-grid gap="small-200">
            <s-paragraph>
              Start by uploading an image to your gallery or choose from one of our templates.
            </s-paragraph>
            <s-stack direction="inline" gap="small-200">
              <s-button>Upload image</s-button>
              <s-button tone="neutral" variant="tertiary">Browse templates</s-button>
            </s-stack>
          </s-grid>
          <s-box maxInlineSize="200px">
            <s-image
              src="https://cdn.shopify.com/static/images/polaris/patterns/callout.png"
              alt="Customize checkout illustration"
              aspectRatio="1/0.5"
              borderRadius="base"
            ></s-image>
          </s-box>
        </s-grid>
      </s-section>
      <!-- === -->
      <!-- Puzzle templates -->
      <!-- The link to every template is the section's action, so it sits in the secondary-actions slot. -->
      <!-- Each template is its own tile, so its image and its View action read as one item. -->
      <!-- === -->
      <s-section heading="Puzzle templates">
        <s-button slot="secondary-actions" href="/puzzles">See all templates</s-button>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(155px, 1fr))" gap="base">
          <!-- Featured template 1 -->
          <s-box border="base" borderRadius="base" overflow="hidden">
            <s-clickable href="/puzzles/4-piece" accessibilityLabel="4-Pieces puzzle template">
              <s-image
                aspectRatio="1/1"
                objectFit="cover"
                alt="4-Pieces puzzle template"
                src="https://cdn.shopify.com/static/images/polaris/patterns/4-pieces.png"
              ></s-image>
            </s-clickable>
            <s-divider></s-divider>
            <s-grid gridTemplateColumns="1fr auto" padding="small" gap="small" alignItems="center">
              <s-heading>4-Pieces</s-heading>
              <s-button href="/puzzles/4-piece" accessibilityLabel="View 4-Pieces puzzle template">
                View
              </s-button>
            </s-grid>
          </s-box>
          <!-- Featured template 2 -->
          <s-box border="base" borderRadius="base" overflow="hidden">
            <s-clickable href="/puzzles/9-piece" accessibilityLabel="9-Pieces puzzle template">
              <s-image
                aspectRatio="1/1"
                objectFit="cover"
                alt="9-Pieces puzzle template"
                src="https://cdn.shopify.com/static/images/polaris/patterns/9-pieces.png"
              ></s-image>
            </s-clickable>
            <s-divider></s-divider>
            <s-grid gridTemplateColumns="1fr auto" padding="small" gap="small" alignItems="center">
              <s-heading>9-Pieces</s-heading>
              <s-button href="/puzzles/9-piece" accessibilityLabel="View 9-Pieces puzzle template">
                View
              </s-button>
            </s-grid>
          </s-box>
          <!-- Featured template 3 -->
          <s-box border="base" borderRadius="base" overflow="hidden">
            <s-clickable href="/puzzles/16-piece" accessibilityLabel="16-Pieces puzzle template">
              <s-image
                aspectRatio="1/1"
                objectFit="cover"
                alt="16-Pieces puzzle template"
                src="https://cdn.shopify.com/static/images/polaris/patterns/16-pieces.png"
              ></s-image>
            </s-clickable>
            <s-divider></s-divider>
            <s-grid gridTemplateColumns="1fr auto" padding="small" gap="small" alignItems="center">
              <s-heading>16-Pieces</s-heading>
              <s-button href="/puzzles/16-piece" accessibilityLabel="View 16-Pieces puzzle template">
                View
              </s-button>
            </s-grid>
          </s-box>
        </s-grid>
      </s-section>
      <!-- === -->
      <!-- News -->
      <!-- News items are rows separated by dividers, rather than bordered boxes inside the card. -->
      <!-- === -->
      <s-section heading="News">
        <s-button slot="secondary-actions" href="/news">See all news</s-button>
        <s-stack gap="base">
          <!-- News item 1 -->
          <s-stack gap="small-400">
            <s-text color="subdued">Jan 21, 2025</s-text>
            <s-link href="/news/new-shapes-and-themes">
              <s-heading>New puzzle shapes and themes added</s-heading>
            </s-link>
            <s-paragraph>
              We've added 5 new puzzle piece shapes and 3 seasonal themes to help you create more
              engaging and unique puzzles for your customers.
            </s-paragraph>
          </s-stack>
          <s-divider></s-divider>
          <!-- News item 2 -->
          <s-stack gap="small-400">
            <s-text color="subdued">Nov 6, 2024</s-text>
            <s-link href="/news/puzzle-difficulty-customization">
              <s-heading>Puzzle difficulty customization features</s-heading>
            </s-link>
            <s-paragraph>
              Now you can fine-tune the difficulty of your puzzles with new rotation controls, edge
              highlighting options, and piece recognition settings.
            </s-paragraph>
          </s-stack>
        </s-stack>
      </s-section>
      <!-- === -->
      <!-- Featured apps -->
      <!-- Each app is its own tile, two to a row on wider screens. The whole tile is the link, so it holds no button of its own. -->
      <!-- If dismissed, use local storage or a database entry to avoid showing this section again to the same user. -->
      <!-- === -->
      <s-section id="featured-apps-section" heading="Featured apps">
        <s-button
          slot="secondary-actions"
          onClick="window.puzzleApp.dismissSection(document.getElementById('featured-apps-section'))"
          icon="x"
          tone="neutral"
          variant="tertiary"
          accessibilityLabel="Dismiss featured apps"
        ></s-button>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="base">
          <!-- Featured app 1 -->
          <s-clickable
            href="https://apps.shopify.com/flow"
            target="_blank"
            border="base"
            borderRadius="base"
            padding="base"
            accessibilityLabel="Get Shopify Flow on the Shopify App Store"
          >
            <s-grid gridTemplateColumns="auto 1fr auto" alignItems="start" gap="base">
              <s-thumbnail
                size="small"
                src="https://cdn.shopify.com/app-store/listing_images/15100ebca4d221b650a7671125cd1444/icon/CO25r7-jh4ADEAE=.png"
                alt=""
              ></s-thumbnail>
              <s-box>
                <s-heading>Shopify Flow</s-heading>
                <s-paragraph color="subdued">Free</s-paragraph>
                <s-paragraph color="subdued">Automate everything and get back to business.</s-paragraph>
              </s-box>
              <s-icon type="external"></s-icon>
            </s-grid>
          </s-clickable>
          <!-- Featured app 2 -->
          <s-clickable
            href="https://apps.shopify.com/planet"
            target="_blank"
            border="base"
            borderRadius="base"
            padding="base"
            accessibilityLabel="Get Shopify Planet on the Shopify App Store"
          >
            <s-grid gridTemplateColumns="auto 1fr auto" alignItems="start" gap="base">
              <s-thumbnail
                size="small"
                src="https://cdn.shopify.com/app-store/listing_images/87176a11f3714753fdc2e1fc8bbf0415/icon/CIqiqqXsiIADEAE=.png"
                alt=""
              ></s-thumbnail>
              <s-box>
                <s-heading>Shopify Planet</s-heading>
                <s-paragraph color="subdued">Free</s-paragraph>
                <s-paragraph color="subdued">Offer carbon-neutral shipping and showcase your commitment.</s-paragraph>
              </s-box>
              <s-icon type="external"></s-icon>
            </s-grid>
          </s-clickable>
        </s-grid>
      </s-section>

    <!-- Footer help -->
    <s-stack alignItems="center" paddingBlock="large">
      <s-text color="subdued">Learn more about <s-link href="https://help.shopify.com" target="_blank">creating engaging puzzles</s-link>.</s-text>
    </s-stack>
</s-page>
  </body>
</html>
```

***
