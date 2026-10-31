import { describe, expect, it } from "vitest";
import { routeNamespaces } from "./route-namespaces";

/** A request that matched `matched`, in a build that has every route in `modules`. */
function contextOf(modules: Record<string, unknown>, matched: readonly string[]) {
  return {
    routeModules: Object.fromEntries(Object.entries(modules).map(([id, handle]) => [id, { handle }])),
    staticHandlerContext: { matches: matched.map((id) => ({ route: { id } })) },
  };
}

const BUILD = {
  root: undefined,
  "routes/public/_layout": { i18n: ["common", "public"] },
  "routes/public/pricing": { i18n: "common" },
  "routes/app/_layout": { i18n: ["common", "admin"] },
  "routes/app/home": { i18n: ["common", "admin"] },
};

describe("routeNamespaces", () => {
  it("is what the MATCHED routes declare, not what every route in the build declares", () => {
    expect(routeNamespaces(contextOf(BUILD, ["root", "routes/public/_layout", "routes/public/pricing"]))).toEqual(["common", "public"]);
    expect(routeNamespaces(contextOf(BUILD, ["root", "routes/app/_layout", "routes/app/home"]))).toEqual(["admin", "common"]);
  });
  it("never lets a public page ship the admin strings", () => {
    expect(routeNamespaces(contextOf(BUILD, ["routes/public/_layout"]))).not.toContain("admin");
  });
  it("leaves out a server namespace, an unknown one and a malformed handle", () => {
    const modules = { a: { i18n: ["common", "email", "ext-x", "nope"] }, b: undefined, c: null, d: "x", e: { i18n: 5 }, f: {} };
    expect(routeNamespaces(contextOf(modules, ["a", "b", "c", "d", "e", "f", "missing"]))).toEqual(["common"]);
  });
  it("is empty when no route declares anything", () => {
    expect(routeNamespaces(contextOf({}, []))).toEqual([]);
  });
});
