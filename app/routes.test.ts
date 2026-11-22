import type { RouteConfigEntry } from "@react-router/dev/routes";
import { describe, expect, it } from "vitest";
import { SUPPORT_UPLOAD_PATH } from "@firesio/app/shell";
import routes from "~/routes";

interface Mounted {
  /** The address the route answers, from the root. */
  readonly path: string;
  /** The files of the routes around it, outermost first (their middleware runs before it). */
  readonly parents: readonly string[];
}

/** Every route file of the table with its full address and the layouts it sits under. */
function mounted(entries: readonly RouteConfigEntry[], base = "", parents: readonly string[] = []): Map<string, Mounted> {
  const found = new Map<string, Mounted>();
  for (const entry of entries) {
    const path = entry.path === undefined ? base : `${base}/${entry.path}`;
    found.set(entry.file, { path: path === "" ? "/" : path, parents });
    for (const [file, child] of mounted(entry.children ?? [], path, [...parents, entry.file])) found.set(file, child);
  }
  return found;
}

describe("app/routes.ts", () => {
  it("mounts the support file staging route at paths.supportUpload, under the /app layout (its middleware authenticates first)", () => {
    const upload = mounted(routes).get("routes/app/support/upload.ts");
    expect(upload?.path).toBe(SUPPORT_UPLOAD_PATH);
    expect(upload?.parents).toContain("routes/app/layout.tsx");
  });
});
