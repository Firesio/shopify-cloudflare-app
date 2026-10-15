import type { ReactNode } from "react";
import { Link, useRouteLoaderData } from "react-router";
import type { InstallTarget } from "~/lib/install-target";
import { paths } from "~/urls";
import type { loader as layoutLoader } from "./_layout";

/** The id React Router gives `routes/public/_layout.tsx`: its path under `app/`, no extension. */
const PUBLIC_LAYOUT_ID = "routes/public/_layout";

/**
 * How installing works on this deployment, decided once by the public layout's
 * loader. Read through the layout's own id so every page under it agrees, and a
 * page rendered outside it (a test, an error boundary) falls back to the manual
 * flow rather than guessing.
 */
export function useInstallTarget(): InstallTarget {
  const layout = useRouteLoaderData<typeof layoutLoader>(PUBLIC_LAYOUT_ID);
  return layout?.install ?? { kind: "manual", reason: "unset" };
}

/**
 * An "Install" call to action. With an App Store listing it is a plain link out
 * to it (installation starts on Shopify, never on this site); without one it is
 * the in-app link to the manual shop-domain form.
 */
export function InstallLink({ className, children }: { readonly className: string; readonly children: ReactNode }) {
  const target = useInstallTarget();
  if (target.kind === "appStore") {
    return (
      <a href={target.url} className={className} rel="noopener">
        {children}
      </a>
    );
  }
  return (
    <Link to={paths.login()} className={className}>
      {children}
    </Link>
  );
}
