---
title: Versioning for web components
description: >-
  The Polaris web component library is versioned. Choose the release your app
  loads by naming it in the script tag, and control when your app moves to a new
  version. This reference documents Polaris 2.0.
api_version: v2.0
source_url:
  html: 'https://shopify.dev/docs/api/app-home/latest/web-components/versioning'
  md: 'https://shopify.dev/docs/api/app-home/latest/web-components/versioning.md'
api_name: app-home
---

# Versioning for web components

The Polaris web component library is versioned. Choose the release your app loads and control when your app moves to a new version. This reference documents Polaris 2.0.

For production, we recommend the stable channel, `polaris-2.js`. It always serves the newest stable release in Polaris 2, so bug fixes, accessibility improvements, and new components reach your app without a script-tag change.

***

## Adding Polaris to your app

You can pin any app to a particular version of the Polaris web component library, but the method you use depends on how you built it.

The snippets below load the stable channel, `polaris-2.js`. Only name a specific release, like `polaris-2.0.js`, if you need to lock your app to exactly Polaris 2.0. To learn more, see [Stable releases and release candidates](#stable-releases-and-release-candidates).

A 2.0 bundle carries both the current admin theme and Admin Next, and follows whichever theme the merchant's admin is using. Apps load one bundle and don't need a flag or per-theme URL.

#### HTML

To add Polaris to an app built with any framework, add the following script tags to your app's HTML head. Load App Bridge alongside Polaris: App Bridge connects your app to Shopify admin, and the `shopify-api-key` meta tag tells it which app is loading.

##### HTML

```html
<head>
  <meta name="shopify-api-key" content="%SHOPIFY_API_KEY%" />
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <script src="https://cdn.shopify.com/shopifycloud/polaris-2.js"></script>
</head>
```

##### Remix

```tsx
// app/root.tsx
export default function App() {
  return (
    <html>
      <head>
        <meta name="shopify-api-key" content="%SHOPIFY_API_KEY%" />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
        <script src="https://cdn.shopify.com/shopifycloud/polaris-2.js" />
      </head>
    </html>
  );
}
```

App Bridge isn't versioned with Polaris, so its script tag has no version in the URL and always loads the latest App Bridge. To learn what App Bridge provides, see [App Bridge APIs](https://shopify.dev/docs/api/app-home/latest/apis).

#### React Router template

Apps that you scaffold using [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) include Polaris automatically, and load the newest stable release of Polaris version 1 by default.

Apps scaffolded by [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) don't have a script tag to directly edit. Instead, the `AppProvider` component from [`@shopify/shopify-app-react-router`](https://www.npmjs.com/package/@shopify/shopify-app-react-router) renders the App Bridge and Polaris script tags for you, and your app's document responses carry a `Link` header that preloads the Polaris script. To build a React Router app against Polaris 2, set the release you want in both places, and keep them the same: if they disagree, the browser downloads a file your app never runs.

##### React Router

```tsx
// app/routes/app.tsx
<AppProvider
  apiKey={apiKey}
  polarisUrl="https://cdn.shopify.com/shopifycloud/polaris-2.js"
>
  <Outlet />
</AppProvider>
```

##### Server configuration

```ts
// app/shopify.server.ts
const shopify = shopifyApp({
  // ...
  polarisUrl: 'https://cdn.shopify.com/shopifycloud/polaris-2.js',
});
```

Both options are optional, and both default to the unversioned `polaris.js` entry point, so an app that sets neither behaves exactly as it does today. The unversioned entry point tracks the 1.x line and never serves 2.x. They require `@shopify/shopify-app-react-router` 2.1.0 or later.

***

## Type​Script packages

For TypeScript users, Shopify publishes the [@shopify/polaris-types](https://www.npmjs.com/package/@shopify/polaris-types) package. Match the package version to the release your app loads, so that your types describe the components your app actually renders.

If you load `polaris-2.js`, install `@shopify/polaris-types@^2.0.0`. If you load `polaris-2.0.js`, install `@shopify/polaris-types@~2.0.0`, so the package stays on 2.0 like the script tag. If you follow `polaris-1.js`, install `@shopify/polaris-types@^1.1.0`.

For reproducible installs, pin the exact version instead. Update the script tag and the package together when you move to a new release.

***

## Available versions

The following table shows the different options for configuring your script tag and the version of the library that is served. For production, we recommend the stable channel, `polaris-2.js`.

| Script tag | Serves | Notes |
| - | - | - |
| `polaris-2.js` | The newest stable release in Polaris 2, currently 2.0 | Advances each time a new 2.x release goes stable |
| `polaris-2.0.js` | Polaris 2.0 | Frozen as released |
| `polaris-1.js` | The newest stable release in Polaris 1, currently 1.1 | Advances each time a new 1.x release goes stable |
| `polaris-1.1.js` | Polaris 1.1 | Frozen as released |
| `polaris-1.0.js` | Polaris 1.0 | Frozen as released |
| `polaris.js` | The legacy unversioned entry point, currently 1.1 | Advances with each new stable 1.x release. Never serves 2.x |

### Stable releases and release candidates

Each stable release is also published at its own URL, like `polaris-1.1.js` and `polaris-2.0.js`. Published stable versions are immutable except for critical security fixes, ensuring that your app continues using the version of the library you tested against. If you need to control exactly when your app moves, name a specific version instead of the channel.

Promotion doesn't update the release candidate URL in place. The stable release publishes at its own URL instead, so moving to it is a change you make in your app's code: if your app loads the 2.0 release candidate, update the script tag to `polaris-2.0.js` for that release, or to `polaris-2.js` to follow the channel.

***
