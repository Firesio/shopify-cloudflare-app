import assert from "node:assert/strict";
import test from "node:test";
import { CHILD_COMPILER_PLUGIN_NAME, createChildCompilerGuard } from "./vite-child-compiler.mjs";

/** One evaluation of vite.config.ts: a fresh module instance that shares only `globals` with the others. */
function evaluateConfig(globals) {
  const guard = createChildCompilerGuard(globals);
  return { guard, isChildCompiler: guard.isChildCompiler() };
}

/** Stands for @react-router/dev: its configResolved hook evaluates the config again (the child compiler). */
function reactRouterPlugin(globals, seen) {
  return {
    name: CHILD_COMPILER_PLUGIN_NAME,
    async configResolved() {
      await Promise.resolve(); // the real hook awaits (`es-module-lexer`'s init) before it loads the config
      seen.push(evaluateConfig(globals).isChildCompiler);
    },
  };
}

/** Stands for Vite starting (or restarting) one dev server: evaluate the config, then run the resolved-config hooks. */
async function startServer(globals, seen) {
  const main = evaluateConfig(globals);
  await main.guard.markChildCompilerLoads(reactRouterPlugin(globals, seen)).configResolved({ command: "serve" });
  return main.isChildCompiler;
}

test("a plain evaluation is the main config", () => {
  assert.equal(evaluateConfig({}).isChildCompiler, false);
});

test("the evaluation React Router starts from configResolved is the child compiler, and only that one", async () => {
  const globals = {};
  const seen = [];
  assert.equal(await startServer(globals, seen), false);
  assert.deepEqual(seen, [true]);
  assert.equal(evaluateConfig(globals).isChildCompiler, false, "the window closes with the hook");
});

test("a dev-server restart evaluates the main config again and keeps the Cloudflare plugin (an evaluation counter did not)", async () => {
  const globals = {};
  const seen = [];
  const mains = [];
  for (let start = 0; start < 3; start += 1) mains.push(await startServer(globals, seen));
  assert.deepEqual(mains, [false, false, false], "every start and restart is a main config");
  assert.deepEqual(seen, [true, true, true], "every child compiler is still told apart");
});

test("a callback created inside the hook (the child's file watcher) that fires after it is not a child", async () => {
  const globals = {};
  const later = [];
  const plugin = createChildCompilerGuard(globals).markChildCompilerLoads({
    name: CHILD_COMPILER_PLUGIN_NAME,
    configResolved() {
      setTimeout(() => later.push(evaluateConfig(globals).isChildCompiler), 5);
    },
  });
  await plugin.configResolved({ command: "serve" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(later, [false], "the restart it triggers inherits the context, but the hook is over");
});

test("overlapping starts do not leak the child's window into each other", async () => {
  const globals = {};
  const seen = [];
  assert.deepEqual(await Promise.all([startServer(globals, seen), startServer(globals, seen)]), [false, false]);
  assert.deepEqual(seen, [true, true]);
});

test("a hook that throws does not leave the guard stuck", async () => {
  const globals = {};
  const plugin = createChildCompilerGuard(globals).markChildCompilerLoads({
    name: CHILD_COMPILER_PLUGIN_NAME,
    async configResolved() {
      throw new Error("boom");
    },
  });
  await assert.rejects(() => plugin.configResolved({}), /boom/);
  assert.equal(evaluateConfig(globals).isChildCompiler, false);
});

test("the wrapped hook keeps the plugin's other fields and passes Vite's context, arguments and result through", async () => {
  const { guard } = evaluateConfig({});
  const wrapped = guard.markChildCompilerLoads({
    name: CHILD_COMPILER_PLUGIN_NAME,
    enforce: "pre",
    async configResolved(a, b) {
      return `${this.label}:${a}-${b}`;
    },
  });
  assert.equal(wrapped.enforce, "pre");
  assert.equal(await wrapped.configResolved.call({ label: "ctx" }, "x", "y"), "ctx:x-y");
});

test("the object form of the hook is wrapped too", async () => {
  const globals = {};
  let child;
  const wrapped = createChildCompilerGuard(globals).markChildCompilerLoads({
    name: CHILD_COMPILER_PLUGIN_NAME,
    configResolved: { order: "post", handler: () => void (child = evaluateConfig(globals).isChildCompiler) },
  });
  assert.equal(wrapped.configResolved.order, "post");
  await wrapped.configResolved.handler();
  assert.equal(child, true);
});

test("other plugins are returned untouched", () => {
  const other = { name: "vite-plugin-cloudflare", configResolved() {} };
  assert.equal(evaluateConfig({}).guard.markChildCompilerLoads(other), other);
});

test("a React Router plugin without configResolved fails loudly instead of starting a second workerd", () => {
  assert.throws(() => evaluateConfig({}).guard.markChildCompilerLoads({ name: CHILD_COMPILER_PLUGIN_NAME }), /no configResolved hook/);
});
