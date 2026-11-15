import type { BillingCommands, BillingGrantCommands, Received, ShopsCommands, SupportCommands, SupportOpenCommands } from "@firesio/portal-contract";

/**
 * The portal's view of this app's `AdminApi` over RPC: every input is `unknown` until the app has validated it (`Received`), and the
 * template supports `support().open` and the grants commands, so they are not optional here.
 */
interface AdminApiOverRpc extends Rpc.WorkerEntrypointBranded {
  shops(): Received<ShopsCommands>;
  billing(): Received<BillingCommands> & Received<BillingGrantCommands>;
  support(): Received<SupportCommands> & Received<SupportOpenCommands>;
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
