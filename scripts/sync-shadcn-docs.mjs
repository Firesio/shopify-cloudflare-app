#!/usr/bin/env node
// Mirrors shadcn/ui's official Markdown docs (Radix base) and the `dashboard-01`
// example source into docs/shadcn/, for fast local agent search.

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE = "https://ui.shadcn.com";
const OUTPUT_ROOT = path.resolve("docs/shadcn");
const EXAMPLE_REGISTRY = `${SITE}/r/styles/new-york-v4/dashboard-01.json`;
const GUIDES = [
  "",
  "cli",
  "components-json",
  "theming",
  "dark-mode",
  "dark-mode/vite",
  "installation/react-router",
  "installation/manual",
  "tailwind-v4",
  "react-19",
  "forms",
  "forms/react-hook-form",
  "skills",
  "changelog",
];
// Radix-base component pages carry the real API; the plain /components/<x> page
// is the same page without the base prefix and is not used.
const COMPONENT_PATTERN = /\/docs\/components\/([a-z0-9-]+)\)/g;

async function get(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "shopify-cloudflare-app-doc-sync/1.0" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

const withNewline = (text) => (text.endsWith("\n") ? text : `${text}\n`);

async function write(file, content) {
  const target = path.join(OUTPUT_ROOT, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, withNewline(content));
}

function titleOf(markdown, fallback) {
  return markdown.match(/^title:\s*(.+)$/m)?.[1].replace(/^['"]|['"]$/g, "") ?? fallback;
}

async function main() {
  const llms = await get(`${SITE}/llms.txt`);
  const components = [...new Set([...llms.matchAll(COMPONENT_PATTERN)].map((m) => m[1]))].sort();
  if (components.length < 50) throw new Error(`Only ${components.length} components found in llms.txt`);

  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  const pages = [];

  for (const guide of GUIDES) {
    const url = `${SITE}/docs${guide ? `/${guide}` : ""}.md`;
    const markdown = await get(url);
    const file = guide ? `guides/${guide.replaceAll("/", "-")}.md` : "guides/introduction.md";
    await write(file, markdown);
    pages.push({ family: "guides", title: titleOf(markdown, guide), file, markdownUrl: url });
  }

  for (const name of components) {
    const url = `${SITE}/docs/components/radix/${name}.md`;
    const markdown = await get(url);
    const file = `components/${name}.md`;
    await write(file, markdown);
    pages.push({ family: "components", title: titleOf(markdown, name), file, markdownUrl: url });
  }

  const registry = JSON.parse(await get(EXAMPLE_REGISTRY));
  const parts = [
    "# Dashboard example (`dashboard-01`)",
    "",
    `Source: ${SITE}/examples/dashboard — registry item \`${registry.name}\`.`,
    "",
    `Registry dependencies: ${registry.registryDependencies.join(", ")}`,
    "",
    `npm dependencies: ${registry.dependencies.join(", ")}`,
    "",
  ];
  for (const file of registry.files) {
    const ext = path.extname(file.path).slice(1);
    parts.push(`## ${file.path.replace("registry/new-york-v4/blocks/dashboard-01/", "")}`, "", `\`\`\`${ext}`, file.content.trimEnd(), "```", "");
  }
  await write("examples/dashboard-01.md", parts.join("\n"));
  pages.push({ family: "examples", title: "Dashboard example", file: "examples/dashboard-01.md", markdownUrl: EXAMPLE_REGISTRY });

  const syncedAt = new Date().toISOString();
  const lines = [
    "# shadcn/ui reference",
    "",
    "Markdown mirrored from shadcn/ui's official docs (Radix base, `new-york-v4` style) for fast local agent search.",
    "",
    `- Source: ${SITE}/docs`,
    `- Synced: ${syncedAt}`,
    `- Pages: ${pages.length}`,
    "- Refresh: `npm run docs:shadcn:sync`",
    "",
    "## Agent lookup workflow",
    "",
    "1. Search with `rg` by component, prop, or composition.",
    "2. Open the exact component page before using it: installed parts, composition, props, examples.",
    "3. Open `examples/dashboard-01.md` for the reference app shell (sidebar, header, cards, chart, data table).",
    "4. Install components with `npx shadcn@latest add <name>`; never hand-write one that exists.",
    "",
  ];
  for (const family of ["guides", "components", "examples"]) {
    lines.push(`## ${family}`, "");
    for (const page of pages.filter((p) => p.family === family)) lines.push(`- [${page.title}](./${page.file})`);
    lines.push("");
  }
  await write("README.md", lines.join("\n"));
  await write("manifest.json", JSON.stringify({ source: `${SITE}/docs`, syncedAt, pageCount: pages.length, pages }, null, 2));
  console.log(`Synced ${pages.length} pages into ${path.relative(process.cwd(), OUTPUT_ROOT)}`);
}

await main();
