import assert from "node:assert/strict";
import test from "node:test";
import { CHILD_COMPILER_PLUGIN_NAME, createChildCompilerGuard } from "./vite-child-compiler.mjs";

// Stands for one evaluation of vite.config.ts: a fresh module instance sharing only `globals`.
function evaluateConfig(globals) {
  const guard = createChildCompilerGuard(globals);
  return { guard, isChildCompiler: guard.isChildCompiler() };
}

// Stands for @react-router/dev: its configResolved hook evaluates the config again (the child compiler).
function reactRouterPlugin(globals, seen) {
  return {
    name: CHILD_COMPILER_PLUGIN_NAME,
    async configResolved(config) {
      await Promise.resolve(); // the real hook awaits before it loads the config
      seen.push({ config, child: evaluateConfig(globals).isChildCompiler });
    },
  };
}

// Stands for Vite starting one server: evaluate the config, then run the resolved-config hooks.
async function startServer(globals, seen) {
  const main = evaluateConfig(globals);
  const plugin = main.guard.markChildCompilerLoads(reactRouterPlugin(globals, seen));
  await plugin.configResolved({ command: "serve" });
  return main.isChildCompiler;
}

test("a plain evaluation is the main config, not a child compiler", () => {
  assert.equal(evaluateConfig({}).isChildCompiler, false);
});

test("the evaluation React Router starts from configResolved is the child compiler, and only that one", async () => {
  const globals = {};
  const seen = [];
  assert.equal(await startServer(globals, seen), false);
  assert.deepEqual(seen.map((s) => s.child), [true]);
  assert.equal(evaluateConfig(globals).isChildCompiler, false, "the context must not outlive the hook");
});

test("a dev-server restart evaluates a main config again; it is not mistaken for a child (the old counter was)", async () => {
  const globals = {};
  const seen = [];
  const mains = [];
  for (let start = 0; start < 4; start += 1) mains.push(await startServer(globals, seen));
  assert.deepEqual(mains, [false, false, false, false], "every (re)start keeps the Cloudflare plugin");
  assert.deepEqual(seen.map((s) => s.child), [true, true, true, true], "every child compiler still skips it");
});

test("a callback created inside the hook (a file watcher) that fires after it is not a child either", async () => {
  const globals = {};
  const later = [];
  const guard = createChildCompilerGuard(globals);
  const plugin = guard.markChildCompilerLoads({
    name: CHILD_COMPILER_PLUGIN_NAME,
    configResolved() {
      setTimeout(() => later.push(evaluateConfig(globals).isChildCompiler), 5);
    },
  });
  await plugin.configResolved({ command: "serve" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(later, [false], "the restart evaluation inherits the context but the hook is over");
});

test("a hook that throws does not leave the guard stuck", async () => {
  const globals = {};
  const guard = createChildCompilerGuard(globals);
  const plugin = guard.markChildCompilerLoads({
    name: CHILD_COMPILER_PLUGIN_NAME,
    async configResolved() {
      throw new Error("boom");
    },
  });
  await assert.rejects(() => plugin.configResolved({}), /boom/);
  assert.equal(evaluateConfig(globals).isChildCompiler, false);
});

test("overlapping restarts do not leak the child context into each other", async () => {
  const globals = {};
  const seen = [];
  const results = await Promise.all([startServer(globals, seen), startServer(globals, seen)]);
  assert.deepEqual(results, [false, false]);
  assert.deepEqual(seen.map((s) => s.child), [true, true]);
});

test("the plugin keeps its other fields, passes its arguments and result through", async () => {
  const globals = {};
  const { guard } = evaluateConfig(globals);
  const original = { name: CHILD_COMPILER_PLUGIN_NAME, enforce: "pre", configResolved: async (a, b) => `${a}-${b}` };
  const wrapped = guard.markChildCompilerLoads(original);
  assert.equal(wrapped.enforce, "pre");
  assert.equal(await wrapped.configResolved("x", "y"), "x-y");
});

test("the object form of a hook is wrapped too", async () => {
  const globals = {};
  const { guard } = evaluateConfig(globals);
  let child;
  const wrapped = guard.markChildCompilerLoads({
    name: CHILD_COMPILER_PLUGIN_NAME,
    configResolved: { order: "post", handler: () => { child = evaluateConfig(globals).isChildCompiler; } },
  });
  assert.equal(wrapped.configResolved.order, "post");
  await wrapped.configResolved.handler();
  assert.equal(child, true);
});

test("other plugins are returned untouched", () => {
  const { guard } = evaluateConfig({});
  const other = { name: "tailwindcss", configResolved() {} };
  assert.equal(guard.markChildCompilerLoads(other), other);
});

test("a React Router plugin with no configResolved fails loudly instead of silently starting a second workerd", () => {
  const { guard } = evaluateConfig({});
  assert.throws(() => guard.markChildCompilerLoads({ name: CHILD_COMPILER_PLUGIN_NAME }), /no configResolved hook/);
});
