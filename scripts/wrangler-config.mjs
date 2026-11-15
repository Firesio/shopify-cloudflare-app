// Reads wrangler.jsonc for the scripts (they cannot import TypeScript and must not guess names the file already holds).
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Strip JSONC comments so the config can be parsed as JSON.
 *
 * String-aware: a `//` inside a value (a URL) must survive, and an escaped quote
 * must not end the string early. A naive regex over the whole file eats both.
 */
export function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** The config for one environment: named envs inherit nothing, so no merging. */
export function configForEnv(config, envName) {
  if (!envName || envName === "top-level") {
    const { env: _env, ...base } = config;
    return base;
  }
  return config.env?.[envName];
}

/** wrangler.jsonc of the repo at `root`, parsed. */
export function readWranglerConfig(root) {
  return JSON.parse(stripJsonComments(readFileSync(join(root, "wrangler.jsonc"), "utf8")));
}

/**
 * The name of the D1 database of one environment (`production`, or the top level when `envName` is empty), read from
 * wrangler.jsonc so no script hard-codes `<slug>-db-prod`. Throws when the environment declares none.
 */
export function databaseName(config, envName) {
  const name = configForEnv(config, envName)?.d1_databases?.[0]?.database_name;
  if (typeof name !== "string" || name === "") throw new Error(`wrangler.jsonc ${envName ? `env.${envName}` : "top level"} declares no d1_databases[0].database_name`);
  return name;
}
