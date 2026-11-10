import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as appLayout from "./app/_layout";
import { links as publicLinks } from "./public/_layout";
import * as root from "../root";
import skeletonStyles from "~/styles/admin/skeleton.css?url";

describe("surface asset ownership", () => {
  it("loads the public stylesheet only from the public layout", () => {
    const links = publicLinks();
    const serialized = JSON.stringify(links);

    expect(links).toHaveLength(1);
    expect(serialized).toContain('"rel":"stylesheet"');
    expect(serialized).not.toContain("cdn.shopify.com");
    expect(serialized).not.toContain("fonts.googleapis.com");
  });

  it("gives the embedded app layout exactly one stylesheet, the skeleton animation, and nothing else", () => {
    const links = appLayout.links();

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ rel: "stylesheet", href: skeletonStyles });
  });

  it("adds no stylesheet at the root, so no surface inherits another's", () => {
    expect("links" in root).toBe(false);
  });

  it("imports the skeleton stylesheet from exactly one source file: the embedded app layout", () => {
    const appDir = join(import.meta.dirname, "..");
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(tsx?|scss|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && /from\s+["'][^"']*admin\/skeleton\.css/.test(readFileSync(path, "utf8"))) importers.push(path.slice(appDir.length));
      }
    };
    walk(appDir);
    expect(importers).toEqual(["/routes/app/_layout.tsx"]);
  });
});
