import type { StartPageData } from "@firesio/app/ui/devices";
import type { MetaDescriptor } from "react-router";
import { PHONE_DEVICES } from "~/core/phone";
import { identity } from "~/core/identity";

/**
 * What a public phone page says about itself in the document head, beside the package's own tab title and robots: the colour of the browser's chrome and,
 * when the shop is known, the manifest of THAT shop, which is what makes the page installable for it (the manifest names the shop in its id and start URL).
 */
export function phoneHead(data: StartPageData | undefined): MetaDescriptor[] {
  const theme = PHONE_DEVICES.manifest?.themeColor;
  return [
    ...(theme === undefined ? [] : [{ name: "theme-color", content: theme }]),
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-title", content: identity.name },
    ...(data === undefined || data.shop === null ? [] : [{ tagName: "link", rel: "manifest", href: `${data.paths.install.replace(/\/$/, "")}/manifest.webmanifest?shop=${encodeURIComponent(data.shop)}` }]),
  ];
}
