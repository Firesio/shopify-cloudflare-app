import { data } from "react-router";
import { describe, expect, it } from "vitest";
import { layoutErrorView } from "./route-error";

/** What React Router hands a boundary for a thrown `data()` / `Response`: an ErrorResponse with status and data. */
const errorResponse = (status: number, body: unknown) => ({ status, statusText: "", internal: false, data: body });

describe("layoutErrorView", () => {
  it("renders the App Bridge bounce page the library throws as a 2xx", () => {
    expect(layoutErrorView(errorResponse(200, "<script></script>"), "/app")).toEqual({ kind: "bounce", html: "<script></script>" });
  });

  it("explains a guard refusal and carries the people to ask", () => {
    const body = { reason: "forbidden", shop: "a.myshopify.com", contacts: [{ name: "Ada", email: "ada@firesio.app" }, { name: null, email: "bo@firesio.app" }] };
    expect(layoutErrorView(errorResponse(403, body), "/app/billing")).toEqual({
      kind: "refusal",
      reason: "forbidden",
      contacts: [{ name: "Ada", email: "ada@firesio.app" }, { name: null, email: "bo@firesio.app" }],
    });
  });

  it("reads a refusal with no contacts, or damaged ones, as nobody to name", () => {
    expect(layoutErrorView(errorResponse(403, { reason: "forbidden", shop: "a.myshopify.com" }), "/app/billing")).toEqual({ kind: "refusal", reason: "forbidden", contacts: [] });
    expect(layoutErrorView(errorResponse(403, { reason: "pending", contacts: [{ name: 3 }] }), "/app")).toEqual({ kind: "refusal", reason: "pending", contacts: [] });
  });

  it("recognises the real thrown value of data(..., { status: 403 })", () => {
    const thrown = data({ reason: "removed" }, { status: 403 });
    expect(layoutErrorView({ ...errorResponse(403, thrown.data) }, "/app").kind).toBe("refusal");
  });

  it("says a person is gone for a 404 on a member's page, and only there", () => {
    expect(layoutErrorView(errorResponse(404, null), "/app/members/abc")).toEqual({ kind: "member_missing" });
    expect(layoutErrorView(errorResponse(404, null), "/app/support/12")).toEqual({ kind: "rethrow" });
    expect(layoutErrorView(errorResponse(404, null), "/app/members")).toEqual({ kind: "rethrow" });
  });

  it.each([
    ["a 403 that is not the app's refusal", errorResponse(403, "nope")],
    ["a 403 with another reason", errorResponse(403, { reason: "banned" })],
    ["a 500", errorResponse(500, null)],
    ["an Error", new Error("boom")],
    ["nothing", undefined],
  ])("rethrows %s", (_label, error) => {
    expect(layoutErrorView(error, "/app")).toEqual({ kind: "rethrow" });
  });
});
