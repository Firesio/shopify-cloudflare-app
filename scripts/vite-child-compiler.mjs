import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Tells React Router's "child compiler" apart from a Vite dev-server restart, for `vite.config.ts`.
 *
 * `@react-router/dev` evaluates `vite.config.ts` a second time to build a child compiler (a second Vite server, used only for CSS):
 * with the Cloudflare plugin in it, every `npm run dev` would start a second workerd, a second remote AI session and a second
 * dependency optimizer. So that evaluation leaves the Cloudflare plugin out.
 *
 * Vite ALSO evaluates the file again, in the same Node process, each time it restarts its dev server (`server.restart()`: an edit
 * to `vite.config.ts`, `.dev.vars` or `wrangler.jsonc`, or `r` in the terminal). Counting evaluations, the previous guard, cannot
 * tell the two apart: after one restart every evaluation counted as a child, the Cloudflare plugin was gone, and the Worker no
 * longer served the app (`tools/architecture/vite-config.test.ts` resolves the config twice, as a restart does).
 *
 * What differs is WHO starts the evaluation: React Router loads the config from inside its own `configResolved` hook
 * (`vite.loadConfigFromFile`, then `createServer` for the child); a restart's evaluation is started by Vite, later. So that hook is
 * wrapped: while it runs, `active` is raised and the call runs in an AsyncLocalStorage context, and an evaluation is the child
 * compiler only when BOTH hold. The context alone is not enough: the child compiler's file watcher is created inside the hook, so
 * the file-change callback that restarts the server later inherits the context. The flag alone is not enough when two starts
 * overlap. `active` falls back in a `finally`, so a hook that throws never leaves the guard stuck.
 *
 * The state lives on `globalThis` under a registered symbol because each evaluation is a fresh instance of the config module.
 * Tested by `scripts/vite-child-compiler.test.mjs` (the decision) and `tools/architecture/vite-config.test.ts` (the real chain).
 */
const STATE_KEY = Symbol.for("firesio.vite-child-compiler-guard.v1");

/** The plugin whose `configResolved` hook creates the child compiler. */
export const CHILD_COMPILER_PLUGIN_NAME = "react-router";

/**
 * @param {object} globals
 * @returns {{ storage: AsyncLocalStorage<true>, active: number }}
 */
function sharedState(globals) {
  const existing = Reflect.get(globals, STATE_KEY);
  if (existing !== null && typeof existing === "object" && existing.storage instanceof AsyncLocalStorage && typeof existing.active === "number") return existing;
  const created = { storage: new AsyncLocalStorage(), active: 0 };
  Reflect.set(globals, STATE_KEY, created);
  return created;
}

/**
 * One per evaluation of `vite.config.ts`.
 *
 * @param {object} [globals] where the shared state lives (`globalThis`); a test passes a fresh object.
 */
export function createChildCompilerGuard(globals = globalThis) {
  const state = sharedState(globals);
  return {
    /** True only for an evaluation started by React Router's own `configResolved` hook. */
    isChildCompiler: () => state.active > 0 && state.storage.getStore() === true,

    /**
     * The plugin with its `configResolved` run as the child compiler's window; any other plugin untouched. Throws when React Router's
     * plugin has no `configResolved`: the guard would stop working without a word, and a second workerd per start is what it prevents.
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
        throw new Error(`The "${CHILD_COMPILER_PLUGIN_NAME}" Vite plugin has no configResolved hook, so its child compiler can no longer be told apart from a dev-server restart: check where @react-router/dev creates it (scripts/vite-child-compiler.mjs).`);
      }
      /**
       * Vite's plugin context (`this`) and the arguments pass through.
       * @this {unknown}
       * @param {Parameters<typeof handler>} args
       */
      const inWindow = function (...args) {
        return state.storage.run(true, async () => {
          state.active += 1;
          try {
            return await handler.apply(this, args);
          } finally {
            state.active -= 1;
          }
        });
      };
      return { ...plugin, configResolved: typeof hook === "function" ? inWindow : { ...hook, handler: inWindow } };
    },
  };
}
