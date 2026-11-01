import { describe, expect, it } from "vitest";

/**
 * Every embedded route asks the member guard, never `authenticateAdmin` directly: a route that did would let a person the
 * app refuses (removed, waiting, not invited) read or change what the guard exists to protect. The guard is the one place
 * that calls the library's authentication for the app, so a new route cannot quietly skip it.
 */
const SOURCES = import.meta.glob(["./**/*.tsx", "./**/*.ts", "../resources/support-upload.tsx", "!./**/*.test.*", "!./**/*.server.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const ALLOWED = new Set<string>();
const CALLS_AUTHENTICATE = /\bauthenticateAdmin\s*\(|authenticate\.admin\s*\(/;
const HAS_LOADER_OR_ACTION = /export const (loader|action)\b/;
const CALLS_GUARD = /guardMember\s*\(/;

describe("the embedded routes", () => {
  const entries = Object.entries(SOURCES).flatMap(([path, source]) => (typeof source === "string" ? [[path, source] as const] : []));

  it("finds the routes it is meant to check", () => {
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.map(([path]) => path).some((path) => path.endsWith("/members.tsx"))).toBe(true);
  });

  it("never call authenticateAdmin or authenticate.admin themselves", () => {
    const offenders = entries.filter(([path, source]) => !ALLOWED.has(path) && CALLS_AUTHENTICATE.test(source)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("guard every loader and action with guardMember, in the same file", () => {
    const needsGuard = entries.filter(([, source]) => HAS_LOADER_OR_ACTION.test(source));
    const unguarded = needsGuard.filter(([, source]) => !CALLS_GUARD.test(source)).map(([path]) => path);
    expect(unguarded).toEqual([]);
  });
});

describe("the checks themselves", () => {
  it("catch a route that authenticates directly, and one with no guard", () => {
    expect(CALLS_AUTHENTICATE.test("const { session } = await authenticateAdmin(request);")).toBe(true);
    expect(CALLS_AUTHENTICATE.test("await shopify.authenticate.admin(request)")).toBe(true);
    expect(CALLS_AUTHENTICATE.test('await guardMember(request, "app:view")')).toBe(false);
    expect(HAS_LOADER_OR_ACTION.test("export const loader = async () => {}")).toBe(true);
    expect(CALLS_GUARD.test("export const loader = async () => ({})")).toBe(false);
    expect(CALLS_GUARD.test('await guardMember(request, "app:view")')).toBe(true);
  });
});
