import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ESLint } from "eslint";
import { boundariesConfig } from "../../eslint.boundaries.js";

/**
 * Where the architecture probes run: a throwaway copy of the app's LAYOUT, outside the repo, that the repo's own ESLint config lints.
 *
 * A probe is a file written where it claims to live (the boundaries plugin classifies files by their path, and resolves their imports
 * on disk). Written into the repo itself, a probe and the files it imports (an adapter, a wiring module: layers the template has no
 * file in) would be seen by everything that reads the sources while the probes run (a test that crawls `app/`, a typecheck, a lint
 * in another terminal), and an interrupted run would leave them behind. So the world is a temporary directory (`os.tmpdir()`) with the
 * repo's `tsconfig.json` (its `~/*` alias), a link to its `node_modules`, and an empty module at each path a probe imports. Nothing is
 * ever written under `app/`, `workers/` or `tools/`, so no crawler needs to know about the probes.
 *
 * Each probe is linted with the repo's `eslint.config.js` (every block, every policy, so a loosened rule fails its probe), rooted at
 * the world (`cwd`, and the repo's own `boundaries/root-path` and resolver settings with their paths moved there, so a broken setting
 * still fails the probes), but runs only the rules it is about (`ruleFilter`) and
 * without type-aware parsing: none of the rules probed reads types, and building the TypeScript program for each probe costs
 * seconds on a large app.
 */
const repo = join(import.meta.dirname, "../..");

export interface Finding {
  readonly rule: string;
  readonly message: string;
}

export interface ProbeWorld {
  /** Writes `code` at `relativePath` of the world, lints it with the rules whose id starts with `rulePrefix`, removes it (or puts the
   * world's empty module back, for a probe at the path of one). */
  readonly lint: (relativePath: string, code: string, rulePrefix: string) => Promise<readonly Finding[]>;
  /** The relative imports (`~/...`, `./...`) of `code` that resolve to no file of the world: a probe that would pass for the wrong reason. */
  readonly unresolved: (relativePath: string, code: string) => readonly Finding[];
  readonly remove: () => Promise<void>;
}

/** A path of the repo's settings, moved to the world: a setting that points anywhere else is a broken setting, and so is its probe. */
function rebased(path: string, root: string): string {
  if (!path.startsWith(`${repo}/`)) throw new Error(`${path} is not a path of the repo (${repo}): eslint.boundaries.js is misconfigured`);
  return `${root}${path.slice(repo.length)}`;
}

/** The repo's boundaries settings (its root path, its resolver and the tsconfig the resolver reads), each path moved to the world. */
function worldSettings(root: string) {
  const { "boundaries/root-path": rootPath, "import/resolver": resolver } = boundariesConfig.settings;
  return {
    "boundaries/root-path": rebased(rootPath, root),
    "import/resolver": { ...resolver, typescript: { ...resolver.typescript, project: resolver.typescript.project.map((path) => rebased(path, root)) } },
  };
}

function linterFor(root: string, rulePrefix: string): ESLint {
  return new ESLint({
    cwd: root,
    overrideConfigFile: join(repo, "eslint.config.js"),
    ruleFilter: ({ ruleId }) => ruleId.startsWith(rulePrefix),
    overrideConfig: { languageOptions: { parserOptions: { projectService: false } }, settings: worldSettings(root) },
  });
}

function unresolvedIn(root: string, relativePath: string, code: string): Finding[] {
  return [...code.matchAll(/from "([^"]+)"/g)]
    .map((match) => match[1] ?? "")
    .filter((specifier) => specifier.startsWith("~/") || specifier.startsWith("."))
    .map((specifier) => ({ specifier, base: specifier.startsWith("~/") ? join(root, "app", specifier.slice(2)) : join(root, dirname(relativePath), specifier) }))
    .filter(({ base }) => ![".ts", ".tsx", "/index.ts"].some((suffix) => existsSync(`${base}${suffix}`)))
    .map(({ specifier }) => ({ rule: "probe/unresolved", message: specifier }));
}

/** A world with an empty module at each of `files` (paths relative to the repo root, e.g. `app/core/plans.ts`). */
export async function createProbeWorld(files: readonly string[]): Promise<ProbeWorld> {
  // The real path: the resolver answers real paths, and `/var` is a link to `/private/var` on macOS.
  const root = await realpath(await mkdtemp(join(tmpdir(), "firesio-architecture-probes-")));
  // The tsconfig files the resolver reads (the `~/*` alias), copied where the world's settings point.
  for (const project of boundariesConfig.settings["import/resolver"].typescript.project) {
    if (existsSync(project)) await copyFile(project, rebased(project, root));
  }
  await symlink(join(repo, "node_modules"), join(root, "node_modules"), "dir");
  for (const file of files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), "export {};\n");
  }
  const linters = new Map<string, ESLint>();
  const lint = async (relativePath: string, code: string, rulePrefix: string): Promise<readonly Finding[]> => {
    const path = join(root, relativePath);
    const linter = linters.get(rulePrefix) ?? linterFor(root, rulePrefix);
    linters.set(rulePrefix, linter);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, `${code}\nexport const probe = 1;\n`);
      const [result] = await linter.lintFiles([path]);
      // A message without a rule (a parse error, "File ignored") is a finding too: an "allows" probe must not pass on a file never linted.
      return (result?.messages ?? []).filter((m) => m.ruleId === null || m.ruleId.startsWith(rulePrefix)).map((m) => ({ rule: m.ruleId ?? "probe/eslint", message: m.message }));
    } finally {
      // A probe at the path of a world file (the composition file, `app/root.tsx`) stands in for it while it is linted.
      await (files.includes(relativePath) ? writeFile(path, "export {};\n") : rm(path, { force: true }));
    }
  };
  return { lint, unresolved: (relativePath, code) => unresolvedIn(root, relativePath, code), remove: () => rm(root, { recursive: true, force: true }) };
}
