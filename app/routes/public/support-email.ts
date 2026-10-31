import { useRouteLoaderData } from "react-router";
import { identity } from "~/identity";
import type { loader as layoutLoader } from "./_layout";

/** The id React Router gives `routes/public/_layout.tsx`: its path under `app/`, no extension. */
const PUBLIC_LAYOUT_ID = "routes/public/_layout";

/**
 * The address every public contact points at, decided once by the layout's
 * loader. Outside that layout (a test, an error boundary) it falls back to the
 * template's stand-in rather than guessing.
 */
export function useSupportEmail(): string {
  const layout = useRouteLoaderData<typeof layoutLoader>(PUBLIC_LAYOUT_ID);
  return layout?.supportEmail ?? identity.contacts.supportEmail;
}
