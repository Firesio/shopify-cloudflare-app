import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve(import.meta.dirname, "setup-skills.mjs");

function git(cwd, ...args) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }

function write(file, content) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content); }

/** A checkout with one skill written here, and a real local git repo standing in for a third-party source. */
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "setup-skills-"));
  const upstream = path.join(root, "upstream", "acme", "skills.git");
  write(path.join(root, "agent-skills", "own-skill", "SKILL.md"), "---\nname: own-skill\ndescription: x\n---\nown\n");
  write(path.join(upstream, "nested", "remote-skill", "SKILL.md"), "---\nname: remote-skill\ndescription: y\n---\nremote\n");
  write(path.join(upstream, "nested", "remote-skill", "extra", "note.md"), "note\n");
  write(path.join(upstream, "unrelated", "big.txt"), "not requested\n");
  git(upstream, "init", "-q"); git(upstream, "config", "user.email", "t@t.t"); git(upstream, "config", "user.name", "t");
  git(upstream, "config", "uploadpack.allowFilter", "true"); git(upstream, "config", "uploadpack.allowAnySHA1InWant", "true");
  git(upstream, "add", "."); git(upstream, "commit", "-qm", "init");
  const ref = git(upstream, "rev-parse", "HEAD");
  const sha256 = execFileSync("node", [script, "--hash", path.join(upstream, "nested", "remote-skill")], { encoding: "utf8" }).trim();
  const writeManifest = (hash) => write(path.join(root, "agent-skills", "third-party.json"), JSON.stringify({
    version: 1, sources: [{ repo: "acme/skills", ref, skills: [{ name: "remote-skill", path: "nested/remote-skill", sha256: hash }] }],
  }));
  writeManifest(sha256);
  const env = { ...process.env, SKILLS_GIT_BASE: `file://${path.join(root, "upstream")}`, CI: "", SKIP_AGENT_SKILLS: "" };
  const run = (...args) => spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8", env });
  return { root, run, writeManifest };
}

test("links own skills and installs a pinned third-party skill, verified by hash", () => {
  const { root, run } = fixture();
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  for (const store of [".claude/skills", ".agents/skills"]) {
    assert.ok(lstatSync(path.join(root, store, "own-skill")).isSymbolicLink(), `${store}/own-skill is a link`);
    assert.match(readFileSync(path.join(root, store, "own-skill", "SKILL.md"), "utf8"), /own/);
  }
  assert.match(readFileSync(path.join(root, ".agents/skills/remote-skill/SKILL.md"), "utf8"), /remote/);
  assert.ok(existsSync(path.join(root, ".agents/skills/remote-skill/extra/note.md")), "files below the skill folder come too");
  assert.ok(existsSync(path.join(root, ".claude/skills/remote-skill/SKILL.md")), "linked for Claude Code");
  assert.ok(!existsSync(path.join(root, ".agents/skills/unrelated")), "only the requested path is taken from the source");
  assert.equal(run("--check").status, 0, "check passes after install");
});

test("a second run changes nothing and does not need the network", () => {
  const { root, run } = fixture();
  assert.equal(run().status, 0);
  const again = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8", env: { ...process.env, SKILLS_GIT_BASE: "file:///nonexistent", CI: "", SKIP_AGENT_SKILLS: "" } });
  assert.equal(again.status, 0, again.stderr);
});

test("content that does not match the pinned hash is refused", () => {
  const { root, run, writeManifest } = fixture();
  writeManifest("0".repeat(64));
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the pinned hash/);
  assert.ok(!existsSync(path.join(root, ".agents/skills/remote-skill")), "nothing is installed");
  assert.equal(run("--check").status, 1);
});

test("--soft turns a network failure into a warning and a zero exit, strict mode fails", () => {
  const { root } = fixture();
  const env = { ...process.env, SKILLS_GIT_BASE: "file:///nonexistent", CI: "", SKIP_AGENT_SKILLS: "" };
  const soft = spawnSync(process.execPath, [script, "--root", root, "--soft"], { encoding: "utf8", env });
  assert.equal(soft.status, 0, soft.stderr);
  assert.match(soft.stderr, /warning/);
  assert.ok(lstatSync(path.join(root, ".claude/skills/own-skill")).isSymbolicLink(), "own skills are still linked");
  const strict = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8", env });
  assert.equal(strict.status, 1);
});

test("a real directory in place of a link is left alone and reported", () => {
  const { root, run } = fixture();
  write(path.join(root, ".claude/skills/own-skill/SKILL.md"), "mine\n");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists and is not a link/);
  assert.equal(readFileSync(path.join(root, ".claude/skills/own-skill/SKILL.md"), "utf8"), "mine\n");
});

test("builds skip it: CI set does nothing", () => {
  const { root } = fixture();
  const result = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8", env: { ...process.env, CI: "1" } });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /skipped/);
  assert.ok(!existsSync(path.join(root, ".claude")), "nothing was created");
});
