import type { BillingCommands, BillingGrantCommands, Received, ShopsCommands, StaffToolsCommands, SupportCommands, SupportOpenCommands, SystemCommands } from "@firesio/portal-contract";

/**
 * The portal's view of this app's `AdminApi` over RPC: every input is `unknown` until the app has validated it (`Received`), and the
 * template supports `support().open`, the grants commands, the `staffTools()` group (`staffTools` in `app/firesio.server.ts`) and the `system()` group (`health`), so they are not
 * optional here. It has no `campaigns()` group: campaigns are mail on consent, which needs a sender Cloudflare Email cannot be (`app/notifications/index.ts`).
 */
interface AdminApiOverRpc extends Rpc.WorkerEntrypointBranded {
  shops(): Received<ShopsCommands>;
  billing(): Received<BillingCommands> & Received<BillingGrantCommands>;
  support(): Received<SupportCommands> & Received<SupportOpenCommands>;
  staffTools(): Received<StaffToolsCommands>;
  system(): Received<SystemCommands>;
}

// Test-only bindings: `@cloudflare/vitest-plugin` types `env` from "cloudflare:test" as `Cloudflare.Env`, so the extra bindings
// vitest.config.ts injects are declared by augmenting that namespace.
declare global {
  namespace Cloudflare {
    interface Env {
      /** The ./drizzle migrations, serialized by vitest.config.ts. */
      TEST_MIGRATIONS: string;
      /** The e2e project only (vitest.config.ts): a service binding to THIS Worker's `AdminApi` entrypoint, the way the portal binds an app (`entrypoint: "AdminApi"`). */
      PORTAL_ADMIN_API: Service<AdminApiOverRpc>;
    }
  }
}
