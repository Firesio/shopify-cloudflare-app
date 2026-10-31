#!/usr/bin/env node
// Make the agent skills available after a fresh clone (runs from `npm install` through `prepare`).
//
//   agent-skills/<name>/        skills written in this repo (tracked). Linked into .claude/skills and .agents/skills.
//   agent-skills/third-party.json  skills that live in someone else's repo, pinned to a commit and a content hash.
//                               Fetched with a sparse checkout, verified, copied into .agents/skills, linked for Claude.
//
// .agents/ and .claude/skills/ are per-developer (gitignored): this script is how a clone gets them.
//
//   node scripts/setup-skills.mjs            install, fail loudly
//   node scripts/setup-skills.mjs --soft     install, but a network problem only warns (what `prepare` uses)
//   node scripts/setup-skills.mjs --check    verify only, no network; exit 1 if anything is missing or changed
//   node scripts/setup-skills.mjs --hash DIR print the content hash to put in third-party.json
//   --root DIR                               operate on another checkout (tests)
//   SKIP_AGENT_SKILLS=1 or CI=1              do nothing (builds do not need agent skills); --force overrides CI
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  readlinkSync, rmSync, symlinkSync, unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const valueOf = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };

const repoRoot = resolve(valueOf("root") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const ownDir = join(repoRoot, "agent-skills");
const manifestPath = join(ownDir, "third-party.json");
const storeDir = join(repoRoot, ".agents", "skills");
const claudeDir = join(repoRoot, ".claude", "skills");
const gitBase = process.env.SKILLS_GIT_BASE ?? "https://github.com";
const log = (message) => console.log(`[skills] ${message}`);

export function hashFolder(folder) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(relative(folder, path).split("\\").join("/"));
      else throw new Error(`Unsupported file type in a skill: ${path}`);
    }
  };
  walk(folder);
  const hash = createHash("sha256");
  for (const file of files.sort((a, b) => a.localeCompare(b))) { hash.update(file); hash.update(readFileSync(join(folder, file))); }
  return hash.digest("hex");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || String(result.error)).trim()}`);
  return result.stdout.trim();
}

const exists = (path) => { try { lstatSync(path); return true; } catch { return false; } };

/** Link `link` -> `target`. Never replaces a real directory or a link someone else made. Returns a problem string or "". */
function ensureLink(link, target, label) {
  mkdirSync(dirname(link), { recursive: true });
  const wanted = relative(dirname(link), target);
  if (exists(link)) {
    if (!lstatSync(link).isSymbolicLink()) return `${label}: ${relative(repoRoot, link)} already exists and is not a link; left alone`;
    if (resolve(dirname(link), readlinkSync(link)) === target) return "";
    unlinkSync(link);                                   // our own stale link: replace
  }
  symlinkSync(process.platform === "win32" ? target : wanted, link, process.platform === "win32" ? "junction" : "dir");
  return "";
}

function ownSkills() {
  if (!existsSync(ownDir)) return [];
  return readdirSync(ownDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ownDir, entry.name, "SKILL.md")))
    .map((entry) => entry.name);
}

function manifest() {
  if (!existsSync(manifestPath)) return [];
  const data = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (data.version !== 1 || !Array.isArray(data.sources)) throw new Error("agent-skills/third-party.json must have version 1 and a sources array");
  for (const source of data.sources) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(source.repo) || !/^[0-9a-f]{40}$/.test(source.ref)) throw new Error(`Bad source in third-party.json: ${source.repo}`);
    for (const skill of source.skills) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(skill.name) || !/^[\w./-]+$/.test(skill.path) || skill.path.includes("..") || !/^[0-9a-f]{64}$/.test(skill.sha256)) {
        throw new Error(`Bad skill entry in third-party.json: ${skill.name}`);
      }
    }
  }
  return data.sources;
}

function fetchSource(source, tmp) {
  const dir = join(tmp, source.repo.replace("/", "-"));
  mkdirSync(dir, { recursive: true });
  run("git", ["init", "-q"], dir);
  run("git", ["remote", "add", "origin", `${gitBase}/${source.repo}.git`], dir);
  run("git", ["sparse-checkout", "set", "--no-cone", ...source.skills.map((skill) => `/${skill.path}/`)], dir);
  run("git", ["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", source.ref], dir);
  run("git", ["checkout", "-q", "--detach", "FETCH_HEAD"], dir);
  if (run("git", ["rev-parse", "HEAD"], dir) !== source.ref) throw new Error(`${source.repo}: fetched a different commit than the pinned one`);
  return dir;
}

function installThirdParty(problems, networkProblems) {
  const sources = manifest();
  const missing = sources.map((source) => ({ source, skills: source.skills.filter((skill) => {
    const folder = join(storeDir, skill.name);
    return !(existsSync(folder) && hashFolder(folder) === skill.sha256);
  }) })).filter((entry) => entry.skills.length);

  if (missing.length) {
    const tmp = mkdtempSync(join(tmpdir(), "agent-skills-"));
    try {
      for (const { source, skills } of missing) {
        let checkout;
        try { checkout = fetchSource({ ...source, skills }, tmp); } catch (error) { networkProblems.push(`${source.repo}: ${error.message}`); continue; }
        for (const skill of skills) {
          const from = join(checkout, skill.path);
          if (!existsSync(join(from, "SKILL.md")) || hashFolder(from) !== skill.sha256) {
            problems.push(`${skill.name}: content from ${source.repo}@${source.ref.slice(0, 7)} does not match the pinned hash; not installed`);
            continue;
          }
          const to = join(storeDir, skill.name);
          rmSync(to, { recursive: true, force: true });
          mkdirSync(storeDir, { recursive: true });
          cpSync(from, to, { recursive: true });
          log(`installed ${skill.name} (${source.repo}@${source.ref.slice(0, 7)})`);
        }
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  for (const skill of sources.flatMap((source) => source.skills)) {
    const folder = join(storeDir, skill.name);
    if (existsSync(folder) && hashFolder(folder) === skill.sha256) {
      const problem = ensureLink(join(claudeDir, skill.name), folder, skill.name);
      if (problem) problems.push(problem);
    }
  }
}

function verify() {
  const problems = [];
  for (const name of ownSkills()) {
    for (const store of [claudeDir, storeDir]) {
      const link = join(store, name);
      if (!exists(link) || !existsSync(join(link, "SKILL.md"))) problems.push(`${name}: missing in ${relative(repoRoot, store)}`);
    }
  }
  for (const source of manifest()) {
    for (const skill of source.skills) {
      const folder = join(storeDir, skill.name);
      if (!existsSync(folder)) problems.push(`${skill.name}: not installed`);
      else if (hashFolder(folder) !== skill.sha256) problems.push(`${skill.name}: installed content differs from the pinned hash`);
      else if (!exists(join(claudeDir, skill.name))) problems.push(`${skill.name}: not linked for Claude Code`);
    }
  }
  return problems;
}

function main() {
  const hashTarget = valueOf("hash");
  if (hashTarget) { console.log(hashFolder(resolve(hashTarget))); return 0; }
  if (has("check")) {
    const problems = verify();
    problems.forEach((problem) => console.error(`[skills] ${problem}`));
    log(problems.length ? `${problems.length} problem(s). Run: npm run setup:skills` : "all agent skills are in place");
    return problems.length ? 1 : 0;
  }
  if ((process.env.SKIP_AGENT_SKILLS || process.env.CI) && !has("force")) { log("skipped (SKIP_AGENT_SKILLS or CI is set)"); return 0; }

  const problems = [], networkProblems = [];
  for (const name of ownSkills()) {
    for (const store of [claudeDir, storeDir]) {
      const problem = ensureLink(join(store, name), join(ownDir, name), name);
      if (problem) problems.push(problem);
    }
  }
  try { installThirdParty(problems, networkProblems); } catch (error) { problems.push(error.message); }

  const soft = has("soft");                              // `prepare` must never break `npm install`
  [...problems, ...networkProblems].forEach((problem) => console.error(`[skills] ${soft ? "warning: " : ""}${problem}`));
  if (soft && (problems.length || networkProblems.length)) log("some skills were not installed; run `npm run setup:skills` for details");
  if (!problems.length && !networkProblems.length) log("agent skills are up to date");
  return !soft && (problems.length || networkProblems.length) ? 1 : 0;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) process.exit(main());
