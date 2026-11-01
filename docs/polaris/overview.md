---
title: App Home
description: >-
  The App Home is the area in the Shopify admin where your apps open and is the
  main surface through which merchants use your app. Your app interacts with
  other parts of Shopify admin using a JavaScript SDK called App Bridge.
api_version: v2.0
source_url:
  html: 'https://shopify.dev/docs/api/app-home/latest'
  md: 'https://shopify.dev/docs/api/app-home/latest.md'
api_name: app-home
---

# App Home iframe apps

App Home is your app's dedicated space in [Shopify admin](https://shopify.dev/docs/apps/build/admin), where it renders its landing page and UI. Merchants use it to navigate to your app's other pages, open modals and workflows, and access your app's data.

Your app renders its UI in an iframe using web components, and communicates with the rest of Shopify admin through App Bridge, a JavaScript SDK. With App Bridge and web components from Shopify's Polaris design system, you can build performant apps using familiar web technologies.

## Getting started

**Info:**

The Polaris web component library for App Home (iframe) apps is versioned. This reference documents version 2.0, the latest stable version. To learn more about the library versioning, see [Versioning for web components](https://shopify.dev/docs/api/app-home/latest/web-components/versioning) and [The Polaris CDN is adopting semantic versioning](https://shopify.dev/changelog/the-polaris-cdn-is-adopting-semantic-versioning).

You can build for App Home two ways: iframe-based apps (covered in this reference) and [App Home UI extensions](https://shopify.dev/docs/api/app-home-ui-extension/latest). To choose the right option for your use case, see [Apps in App Home](https://shopify.dev/docs/apps/build/app-home).

To build your first iframe-based app in App Home, [scaffold an app](https://shopify.dev/docs/apps/build/scaffold-app) with the [Shopify CLI](https://shopify.dev/docs/api/shopify-cli). When prompted for the app type, select **Build a React Router app**.

The command scaffolds an app with all the Shopify App Bridge and Polaris libraries you need to build for App Home.

If your app already loads Polaris 1, then see [Update your app for Polaris 2](https://shopify.dev/docs/apps/build/app-home/polaris2) for what changes and what to check in the parts of your UI that Polaris doesn't control.

## Generate scaffold

```terminal
cd my-app
shopify app init
```

***

## Building your app

You build your app with UI components and Shopify's APIs.

![App Bridge web components example](https://shopify.dev/assets/assets/images/api/app_home/overview-all-DLVhNVsj.png)

### Web components

You add UI to your app with web components. Shopify's Polaris library provides components that match the [Shopify design system](https://shopify.dev/docs/apps/design).

Polaris components are built on the [Web Components standard](https://developer.mozilla.org/en-US/docs/Web/Web_Components), so they work like native HTML elements. Use them in any framework or with vanilla JavaScript, just like a `<button>` or `<input>`.

The Polaris web components library is [versioned](https://shopify.dev/docs/api/app-home/latest/web-components/versioning).

[Reference - Explore all Polaris web components](https://shopify.dev/docs/api/app-home/v2.0/web-components)

## Render a page in App Home

```jsx
export default function App() {
  return (
    <s-page heading="My App">
      <s-section heading="Welcome">
        <s-paragraph>
          Welcome to your Shopify app! Start building the main interface here.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
```

### APIs

Your app uses APIs to read data from Shopify admin, launch workflows like creating products or editing orders, and give merchants feedback through toasts and modals. Shopify's App Bridge library exposes these APIs through the `shopify` global variable.

The App Bridge script authenticates these APIs for you, so there's no additional setup. Apps scaffolded with Shopify CLI already include the script.

[Reference - App Bridge APIs reference](https://shopify.dev/docs/api/app-home/v2.0/apis)

## Retrive session token to authenticate with your backend

```jsx
export default function App() {
  const syncProducts = async () => {
    const token = await shopify.idToken();


    await fetch('/api/sync-products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  };


  return (
    <button onClick={syncProducts}>Sync products</button>
  );
}
```

### App Bridge web components

Use App Bridge web components to add UI elements like title bars and navigation menus to Shopify admin outside your app's iframe.

[Reference - App Bridge web components reference](https://shopify.dev/docs/api/app-home/v2.0/app-bridge-web-components)

## Render a title bar and navigation menu

```jsx
import {TitleBar, NavMenu} from '@shopify/app-bridge-react';


export default function App() {
  return (
    <>
      <TitleBar title="Product Details" subtitle="SKU: ABC-123" />
      <NavMenu>
        <a href="/">Home</a>
        <a href="/products">Products</a>
        <a href="/settings">Settings</a>
      </NavMenu>
    </>
  );
}
```

![App Bridge web components example](https://shopify.dev/assets/assets/images/api/app_home/overview-app-bridge-BWYVSumL.png)

***

## Page patterns

Shopify provides page templates for common patterns like landing pages and settings pages, so your app looks and behaves consistently with Shopify admin and meets [Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify) standards.

Shopify also provides UI compositions (combinations of Polaris web components and APIs) that you can add to your app's pages for common needs like data tables, empty states, and setup flows.

[Reference - App Home page patterns](https://shopify.dev/docs/api/app-home/v2.0/patterns)

[Reference - Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify)

***

## Direct API access

Your app can query the Shopify [Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql) directly from its front-end code using the standard `fetch()` API. For your app to make direct calls to the Admin GraphQL API, you need to enable direct API access in your [configuration file](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration) using the `embedded_app_direct_api_access` property.

App Bridge automatically authenticates these requests, so you don't need to manage tokens or headers yourself. Use the `shopify:admin/api/graphql.json` URL to make authenticated requests to the Admin GraphQL API.

[Reference - Resource Fetching API](https://shopify.dev/docs/api/app-home/v2.0/apis/authentication-and-data/resource-fetching-api)

## Query Shopify data

```jsx
async function getProducts() {
  const response = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    body: JSON.stringify({
      query: `
        query {
          products(first: 10) {
            edges {
              node {
                id
                title
              }
            }
          }
        }
      `,
    }),
  });
  const { data } = await response.json();
  return data.products.edges;
}
```

***

## Configuration

You define your app's configuration in the `shopify.app.toml` file. This file controls how your app authenticates, what data it can access, and how it integrates with Shopify admin.

Scaffolding your app with Shopify CLI creates a `shopify.app.toml` file with basic settings. Edit it to give your app permission to access Shopify data and make direct calls to the Admin GraphQL API.

## Configure your app

```toml
# Add these settings to shopify.app.toml to control API access and scopes
[access_scopes]
scopes = "read_products,write_products"


[access.admin]
embedded_app_direct_api_access = true
direct_api_mode = "online"
```

### Access scopes

Access scopes define what Shopify data your app can read or write with the Admin GraphQL API. Declare the scopes your app needs before querying the API.

Merchants approve these permissions when they install your app, so request only the scopes your app actually needs.

[Reference - Access scopes reference](https://shopify.dev/docs/api/usage/access-scopes)

[Reference - App configuration reference](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration)

***

## Testing and deployment

Shopify CLI provides tools to test and deploy your app.

### Local development

To run your app locally during development, start a dev server using Shopify CLI. This command creates a tunnel so Shopify can reach your local app.

Your app opens in your development store where you can test changes in real time. The CLI watches for file changes and automatically reloads your app.

## Start development server

```terminal
shopify app dev
```

### Deployment

When you're ready to go live, deploy your app to a hosting service like Google Cloud Run, Fly.io, or Render. This is where your app runs and handles requests from Shopify.

Then run the Shopify CLI `deploy` command to sync your app's configuration and extensions to Shopify so merchants can install it.

## Deploy your app

```terminal
shopify app deploy
```

[Reference - Test apps locally](https://shopify.dev/docs/apps/build/cli-for-apps/test-apps-locally)

[Reference - Deployment guide](https://shopify.dev/docs/apps/launch/deployment)

***

## Resources

[Getting started tutorial\
\
](https://shopify.dev/docs/apps/build/scaffold-app)

[Create your first Shopify app using the CLI scaffold.](https://shopify.dev/docs/apps/build/scaffold-app)

[Build your first app\
\
](https://shopify.dev/docs/apps/build/build?framework=reactRouter)

[Build out your first Shopify app from the scaffolded template.](https://shopify.dev/docs/apps/build/build?framework=reactRouter)

[App design guidelines\
\
](https://shopify.dev/docs/apps/design)

[Follow our UX guidelines to build apps that are predictable and easy to use.](https://shopify.dev/docs/apps/design)

[Developer changelog\
\
](https://shopify.dev/changelog)

[Stay up to date with the latest changes to Shopify APIs and tools.](https://shopify.dev/changelog)

[Developer community\
\
](https://community.shopify.dev)

[Connect with other developers and get help with your questions.](https://community.shopify.dev)

***
