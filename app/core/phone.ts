import type { DevicesConfig } from "@firesio/app";
import { identity } from "~/core/identity";

/**
 * The staff phone app's own decisions, read only while `PWA` is on (`app/core/features.ts`). Pure data: nothing here runs while the part is off.
 * What a derived app edits: `PHONE_DENIED` (what a lost or borrowed phone must not open), the colours and icons, and the places in `phoneItems`.
 */

/** The addresses of the phone app's own pages. The defaults of the package; written here so `routes.ts`, the tests and the docs say the same. */
export const PHONE_PATHS = {
  install: "/m",
  start: "/m/start",
  startApi: "/m/api/link/start",
  pollApi: "/m/api/link/poll",
  manifest: "/m/manifest.webmanifest",
  serviceWorker: "/sw.js",
  manage: "/app/phone",
} as const;

/**
 * What the phone must NOT open: prefixes below `/app`, each closed for every method (the page, its data, its actions). The phone is the web admin
 * minus this list, so a page added later works on the phone with no edit here, and a sensitive one needs a line. An empty list is a decision, never a default.
 */
export const PHONE_DENIED: NonNullable<DevicesConfig["denied"]> = [
  { prefix: "plans", why: "the plan and billing: a lost or borrowed phone must not change what the shop pays" },
  { prefix: "members", why: "team management: a lost or borrowed phone must not add or remove people" },
];

/** The brand of the installed app. A manifest takes literal colours (no CSS variables) and at least a 192 and a 512 PNG: replace the two placeholder icons in `public/`. */
export const PHONE_DEVICES: DevicesConfig = {
  denied: PHONE_DENIED,
  manifest: {
    name: identity.name,
    themeColor: "#18181b",
    backgroundColor: "#ffffff",
    icons: [
      { src: "/phone-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/phone-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  },
};
