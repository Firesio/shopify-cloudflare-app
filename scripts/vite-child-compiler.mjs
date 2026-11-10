import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Tells React Router's "child compiler" apart from a Vite dev-server restart.
 *
 * Both evaluate `vite.config.ts` again inside the same Node process, so counting evaluations (the previous guard)
 * cannot tell them apart: after the first restart every evaluation looked like a child and the Cloudflare plugin
 * was left out, which served requests from the Node middleware with no Worker ("getEnv() called outside of a
 * request context").
 *
 * What does differ is WHO triggers the evaluation, and WHEN. React Router's plugin loads the config file from
 * inside its own `configResolved` hook (`vite.loadConfigFromFile`, then `createServer` for the child). A restart's
 * evaluation is started by Vite itself, later. So the plugin's `configResolved` is wrapped: while the wrapped hook
 * runs, `active` is raised and the call runs inside an AsyncLocalStorage context. An evaluation is the child
 * compiler only when BOTH hold.
 *
 * Both are needed. The context alone is not enough: the child compiler's file watcher is created inside the hook,
 * so a later file-change callback (the very one that restarts the server) inherits the context, and an evaluation
 * during that restart would look like a child. The `active` flag alone is not enough for two overlapping starts
 * (the context tells the second start's evaluation is not a descendant of the first start's hook). `active` falls
 * back in a `finally`, so a hook that throws never leaves the guard stuck.
 *
 * The state lives on `globalThis` under a registered symbol because the config module is evaluated afresh each time.
 *
 * Verified by `scripts/vite-child-compiler.test.mjs` (the decision). The real Vite + React Router + Cloudflare plugin
 * chain across `server.restart()` is not covered by an automated check here: after editing `.dev.vars` while
 * `npm run dev` runs, requests must still be served by the Worker (no "getEnv() called outside of a request context").
 */
const STATE_KEY = Symbol.for("shopify-app.vite-child-compiler-guard.v2");

/** The plugin whose `configResolved` creates the child compiler. */
export const CHILD_COMPILER_PLUGIN_NAME = "react-router";

function sharedState(globals) {
  const existing = Reflect.get(globals, STATE_KEY);
  if (existing && existing.storage instanceof AsyncLocalStorage && typeof existing.active === "number") return existing;
  const created = { storage: new AsyncLocalStorage(), active: 0 };
  Reflect.set(globals, STATE_KEY, created);
  return created;
}

/**
 * @param {object} [globals] where the shared state lives; tests pass a fresh object.
 */
export function createChildCompilerGuard(globals = globalThis) {
  const state = sharedState(globals);

  return {
    /** True only while this evaluation was started by React Router's own `configResolved` hook. */
    isChildCompiler: () => state.active > 0 && state.storage.getStore() === true,

    /**
     * Returns the plugin with its `configResolved` run as the child-compiler window. Any other plugin is returned
     * untouched. Throws when the React Router plugin has no `configResolved`: the guard would silently stop
     * working, and a duplicate workerd per start is the failure it exists to prevent.
     *
     * @template {import("vite").Plugin} P
     * @param {P} plugin
     * @returns {P}
     */
    markChildCompilerLoads(plugin) {
      if (plugin.name !== CHILD_COMPILER_PLUGIN_NAME) return plugin;
      const hook = plugin.configResolved;
      const handler = typeof hook === "function" ? hook : hook?.handler;
      if (typeof handler !== "function") {
        throw new Error(
          `The "${CHILD_COMPILER_PLUGIN_NAME}" Vite plugin has no configResolved hook, so its child compiler can no longer be told apart from a dev-server restart. Re-check where @react-router/dev creates it (scripts/vite-child-compiler.mjs).`,
        );
      }
      const inWindow = (...args) =>
        state.storage.run(true, async () => {
          state.active += 1;
          try {
            return await handler.apply(undefined, args);
          } finally {
            state.active -= 1;
          }
        });
      return {
        ...plugin,
        configResolved: typeof hook === "function" ? inWindow : { ...hook, handler: inWindow },
      };
    },
  };
}
