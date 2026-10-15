import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";

import { createShopify } from "~/shopify.server";
import { getEnv } from "~/request-context.server";
import { installTarget } from "~/lib/install-target";
import { loginErrorKey } from "./login-error.server";

export const handle = { i18n: ["common", "admin"] };

/**
 * Once the app is listed, installation starts on the App Store and nobody types
 * a shop domain here (App Store requirement 2.3.1): this route never renders
 * its form, and anything that lands on it without a shop goes to the listing.
 * A request that DOES carry a shop (the library sending an expired session back
 * through login) still reaches `login()`, which redirects straight into OAuth.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const env = getEnv();
  const target = installTarget(env.SHOPIFY_APP_HANDLE);
  const hasShop = new URL(request.url).searchParams.has("shop");
  if (target.kind === "appStore" && !hasShop) throw redirect(target.url);

  const errorKey = loginErrorKey(await createShopify(env).login(request));
  if (target.kind === "appStore") throw redirect(target.url);

  // v2's AppProvider requires apiKey (it always loads App Bridge + Polaris web
  // components), so this non-embedded page has to pass it through too.
  return { errorKey, apiKey: env.SHOPIFY_API_KEY || "" };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const env = getEnv();
  // The form is not shown once the app is listed, so a POST here is not a merchant
  // installing: send it where installation is allowed to start.
  const target = installTarget(env.SHOPIFY_APP_HANDLE);
  if (target.kind === "appStore") throw redirect(target.url);

  const errorKey = loginErrorKey(await createShopify(env).login(request));

  return { errorKey, apiKey: env.SHOPIFY_API_KEY || "" };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("admin");
  const [shop, setShop] = useState("");
  const { errorKey, apiKey } = actionData || loaderData;
  const shopError = errorKey ? t(`login.errors.${errorKey}`) : undefined;

  return (
    <AppProvider apiKey={apiKey}>
      <s-page>
        <Form method="post">
          <s-section heading={t("login.heading")}>
            <s-text-field
              name="shop"
              label={t("login.shopDomain")}
              details={t("login.shopDomainHint")}
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={shopError}
            ></s-text-field>
            <s-button type="submit">{t("login.submit")}</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
