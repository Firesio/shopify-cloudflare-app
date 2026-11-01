import type { ReactNode } from "react";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { POLARIS_URL } from "~/admin/polaris";

/**
 * `AppProvider` with the app's Polaris release. Every embedded page renders its frame through this and never through
 * `AppProvider` directly, so the script tag and the server's preload header can never name different releases.
 */
export function EmbeddedProvider({ apiKey, children }: { readonly apiKey: string; readonly children: ReactNode }) {
  return (
    <AppProvider apiKey={apiKey} polarisUrl={POLARIS_URL}>
      {children}
    </AppProvider>
  );
}
