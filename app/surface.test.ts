import { pageActionsFindings, reportRouteFindings } from "@firesio/app/ui/surface/testing/guard";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.join(import.meta.dirname);

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [full] : [];
  });
}

/**
 * Two things a page owes the POS webview and the phone app, held here so nobody has to remember them: its actions go through
 * `PageActions` (a hand-written `slot="primary-action"` keeps Polaris's bar inside POS), and the route the page reports its surface to
 * is mounted. Both fail with a sentence that says what to change.
 */
describe("surfaces", () => {
  it("every page of /app and every component draws its actions through PageActions", () => {
    const files = [...routeFiles(path.join(APP, "routes", "app")), ...routeFiles(path.join(APP, "components"))];
    expect(files.length).toBeGreaterThan(0);
    const findings = files.flatMap((file) => pageActionsFindings(file, readFileSync(file, "utf8")).map((finding) => `${path.relative(APP, file)}:${finding.line} ${finding.rule}`));
    expect(findings).toEqual([]);
  });

  it("mounts the route a page reports its surface to, under the /app layout", () => {
    const findings = reportRouteFindings({
      routesSource: readFileSync(path.join(APP, "routes.ts"), "utf8"),
      readRouteFile: (file) => (existsSync(path.join(APP, file)) ? readFileSync(path.join(APP, file), "utf8") : null),
    });
    expect(findings).toEqual([]);
  });
});
