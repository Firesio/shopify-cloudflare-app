import "@firesio/app/ui/devices/host.css";
import { PhoneNav, PhoneShell, type PhoneNavItem, type PhoneShellProps } from "@firesio/app/ui/devices";
import type { ReactNode } from "react";
import { POLARIS_URL } from "~/core/polaris";

/**
 * What the `/app` layout draws around a page on a staff member's phone (surface `pwa`), in place of `EmbeddedProvider`: Polaris alone (there is no
 * App Bridge outside the Shopify admin), the phone's own header and actions, and the bottom bar. The layout loads this file with `lazy()` and only
 * while `PWA` is on, so its code and `host.css` are a separate chunk the web admin and POS never request (built apart even while the switch is off, about 18 KB gzip).
 */
export default function PhoneLayout({ shop, platform, items, children }: { readonly shop: string; readonly platform: PhoneShellProps["platform"]; readonly items: readonly PhoneNavItem[]; readonly children: ReactNode }) {
  return (
    <PhoneShell shop={shop} polarisUrl={POLARIS_URL} {...(platform === undefined ? {} : { platform })}>
      <PhoneNav items={items} />
      {children}
    </PhoneShell>
  );
}
