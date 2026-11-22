import "@firesio/app/ui/devices/host.css";

/**
 * What the `/app` layout draws around a page on a staff member's phone (surface `pwa`), in place of `EmbeddedProvider`: Polaris alone (there is no App Bridge outside
 * the Shopify admin), the phone's own header and actions, and the bottom bar. It is the package's ready-made layout (`@firesio/app/ui/frame/phone`); the app only adds the
 * stylesheet beside it. `AdminFrame` loads this file with `lazy()` and only while `PWA` is on (the layout does it), so its code and `host.css` are a separate chunk the web
 * admin and POS never request (built apart even while the switch is off, about 18 KB gzip). A derived app that wants another shell writes its own component with the same props
 * (`PhoneLayoutProps`).
 */
export { default } from "@firesio/app/ui/frame/phone";
