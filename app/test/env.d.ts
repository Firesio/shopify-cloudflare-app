// Test-only bindings: `@cloudflare/vitest-plugin` types `env` from "cloudflare:test" as `Cloudflare.Env`, so the extra bindings
// vitest.config.ts injects are declared by augmenting that namespace.
declare namespace Cloudflare {
  interface Env {
    /** The ./drizzle migrations, serialized by vitest.config.ts. */
    TEST_MIGRATIONS: string;
  }
}
