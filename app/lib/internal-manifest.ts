/**
 * The staff console's web app manifest, as data. It makes the console installable
 * ("Add to Home Screen"), which is also the only way web push works on iOS.
 *
 * Colours are the console's neutral palette (neutral-900 for the app chrome,
 * white for the splash) because a manifest takes literal colours, not CSS variables.
 * Pure: the name is a parameter so the identity stays authored in one place.
 */
export const CONSOLE_START_URL = "/internal/dashboard";
export const CONSOLE_SCOPE = "/internal/";
export const CONSOLE_THEME_COLOR = "#171717";
export const CONSOLE_BACKGROUND_COLOR = "#ffffff";

export interface ManifestIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: "image/png";
  readonly purpose: "any" | "maskable";
}

export interface InternalManifest {
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly id: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: "standalone";
  readonly theme_color: string;
  readonly background_color: string;
  readonly icons: readonly ManifestIcon[];
}

export function buildInternalManifest(brandName: string): InternalManifest {
  const name = `${brandName} Console`;
  return {
    name,
    short_name: name,
    description: "Staff console: support tickets, shops and notifications.",
    id: CONSOLE_START_URL,
    start_url: CONSOLE_START_URL,
    scope: CONSOLE_SCOPE,
    display: "standalone",
    theme_color: CONSOLE_THEME_COLOR,
    background_color: CONSOLE_BACKGROUND_COLOR,
    icons: [
      { src: "/internal-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/internal-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/internal-icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
