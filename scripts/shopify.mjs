// Shopify CLI wrapper.
//
// It runs this project's own `@shopify/cli` devDependency (node_modules/.bin/shopify)
// rather than whatever `shopify` is on your PATH, so the CLI version is pinned in
// package.json and every dev and CI runner uses the same one.
//
// The login session is NOT isolated: the CLI keeps using your normal HOME, so the
// account you are already logged into on this machine (`shopify auth login`) is the
// one this project uses, exactly like any other Shopify app.
//
// What it adds on top of the plain CLI is only for `app dev`:
//   - picks free ports for the theme-extension server and GraphiQL when the defaults
//     are taken, and
//   - forces the tunnel onto HTTP/2 (see below).
//
// Usage (via package.json): node scripts/shopify.mjs app dev --config dev
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import {
  DEFAULT_GRAPHIQL_PORT,
  DEFAULT_LOCALHOST_PORT,
  findAvailablePort,
} from "./localhost-port.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Resolve THIS project's CLI, not the global one.
const localBin = join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "shopify.cmd" : "shopify",
);
if (!existsSync(localBin)) {
  console.error(
    "Local @shopify/cli not found at node_modules/.bin/shopify — run `npm install` first.",
  );
  process.exit(1);
}

function isAppDev(args) {
  return args[0] === "app" && args[1] === "dev" && !args.includes("--help");
}

function hasFlag(args, flag) {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function preferredPort(envName, fallback) {
  const configured = process.env[envName];
  if (configured === undefined) return fallback;

  const port = Number(configured);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

async function addAvailablePort(args, { flag, envName, fallback, label }) {
  if (hasFlag(args, flag)) return args;

  const preferred = preferredPort(envName, fallback);
  const port = await findAvailablePort(preferred);
  if (port !== preferred) {
    console.log(`${label} port ${preferred} is in use; using ${port}.`);
  }
  return [...args, `${flag}=${port}`];
}

async function appDevArgs(args) {
  if (!isAppDev(args)) return args;

  let nextArgs = await addAvailablePort(args, {
    flag: "--theme-app-extension-port",
    envName: "SHOPIFY_FLAG_THEME_APP_EXTENSION_PORT",
    fallback: DEFAULT_LOCALHOST_PORT,
    label: "Theme extension",
  });
  nextArgs = await addAvailablePort(nextArgs, {
    flag: "--graphiql-port",
    envName: "SHOPIFY_FLAG_GRAPHIQL_PORT",
    fallback: DEFAULT_GRAPHIQL_PORT,
    label: "GraphiQL",
  });
  return nextArgs;
}

// `shopify app dev` opens a TryCloudflare quick tunnel via the bundled
// cloudflared, which defaults to QUIC (UDP :7844). QUIC registration is
// unreliable behind many NATs and fails intermittently — the tunnel URL prints
// but its hostname never provisions, so the browser reports "server IP address
// could not be found". HTTP/2 rides plain TCP and registers deterministically.
// Force it, overridable: TUNNEL_TRANSPORT_PROTOCOL=quic npm run dev
const cliArgs = await appDevArgs(process.argv.slice(2));
const child = spawn(localBin, cliArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    TUNNEL_TRANSPORT_PROTOCOL: process.env.TUNNEL_TRANSPORT_PROTOCOL ?? "http2",
  },
  shell: false,
});

// Forward Ctrl-C etc. so interactive login / the dev server exit cleanly.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
