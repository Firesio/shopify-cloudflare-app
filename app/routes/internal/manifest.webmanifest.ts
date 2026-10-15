import { identity } from "~/identity";
import { buildInternalManifest } from "~/lib/internal-manifest";

/**
 * The console's web app manifest. It sits OUTSIDE the auth layout on purpose:
 * the browser fetches a manifest without the page's cookies for an install
 * check, and a redirect to the sign-in page would make the app uninstallable.
 * It holds nothing but the product name and icon paths.
 */
export function loader() {
  return new Response(JSON.stringify(buildInternalManifest(identity.brandName)), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
