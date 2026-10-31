import type { SupportSource } from "~/support/inbound/types";

/** Staff-facing names for where a conversation started (English-only console). */
export const SOURCE_LABEL: Record<SupportSource, string> = {
  app_portal: "In-app",
  shopify_relay: "App Store",
  email: "Email",
  web_form: "Support form",
};
