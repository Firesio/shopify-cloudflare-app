import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import { EmbeddedProvider } from "~/components/EmbeddedProvider";
import { installTarget } from "~/core/install-target";
import { services } from "~/wiring/services";
import { shopify } from "~/wiring/shopify";

const MESSAGES = { missingShop: "Enter your store address.", invalidShop: "Enter a valid store address, like your-store.myshopify.com." } as const;

function errorOf(errors: LoginError | undefined): string | undefined {
  if (errors?.shop === LoginErrorType.MissingShop) return MESSAGES.missingShop;
  if (errors?.shop === LoginErrorType.InvalidShop) return MESSAGES.invalidShop;
  return undefined;
}

/**
 * Once the app is listed, installation starts on the App Store and nobody types a shop domain here (App Store requirement
 * 2.3.1): this route never shows its form, and anything that lands on it without a shop goes to the listing. A request that DOES
 * carry a shop (the library sending an expired session back through login) still reaches `login()`, which redirects into OAuth.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { env } = services();
  const target = installTarget(env.SHOPIFY_APP_HANDLE);
  if (target.kind === "appStore" && !new URL(request.url).searchParams.has("shop")) throw redirect(target.url);
  const error = errorOf(await shopify(env).login(request));
  if (target.kind === "appStore") throw redirect(target.url);
  return { error, apiKey: env.SHOPIFY_API_KEY };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { env } = services();
  // The form is not shown once the app is listed, so a POST here is not a merchant installing: send it where installing starts.
  const target = installTarget(env.SHOPIFY_APP_HANDLE);
  if (target.kind === "appStore") throw redirect(target.url);
  return { error: errorOf(await shopify(env).login(request)), apiKey: env.SHOPIFY_API_KEY };
};

export default function Login() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { error, apiKey } = actionData ?? loaderData;
  return (
    <EmbeddedProvider apiKey={apiKey}>
      <s-page>
        <Form method="post">
          <s-section heading="Log in">
            <s-text-field name="shop" label="Shop domain" details="example.myshopify.com" value={shop} onChange={(e) => setShop(e.currentTarget.value)} autocomplete="on" error={error}></s-text-field>
            <s-button type="submit">Log in</s-button>
          </s-section>
        </Form>
      </s-page>
    </EmbeddedProvider>
  );
}
