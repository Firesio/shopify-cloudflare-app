import { describe, expect, it } from "vitest";
import { failureOf } from "./failure";

/** What the router hands a boundary for a thrown response: the same shape `isRouteErrorResponse` recognises. */
const response = (status: number, body: unknown) => ({ status, statusText: "", internal: false, data: body });

describe("failureOf", () => {
  it("keeps the status of a route error and gives it a short line", () => {
    expect(failureOf(response(404, "No route matches URL"), false)).toEqual({ status: 404, title: "Page not found", message: null, detail: null });
    expect(failureOf(response(410, ""), false)).toMatchObject({ status: 410, title: "This address is no longer available" });
    expect(failureOf(response(418, ""), false)).toMatchObject({ status: 418, title: "This request could not be completed" });
    expect(failureOf(response(503, ""), false)).toMatchObject({ status: 503, title: "Something went wrong" });
  });

  it("never shows a stack or an internal message in production", () => {
    const error = new Error("D1_ERROR: no such table shops");
    expect(failureOf(error, false)).toEqual({ status: 500, title: "Something went wrong", message: null, detail: null });
    expect(failureOf("a thrown string", false).detail).toBeNull();
    expect(failureOf(response(404, 'Error: No route matches URL "/x"'), false).detail).toBeNull();
    expect(JSON.stringify(failureOf(error, false))).not.toContain("D1_ERROR");
  });

  it("shows the detail in development", () => {
    expect(failureOf(new Error("boom"), true).detail).toContain("boom");
    expect(failureOf(response(404, "No route matches"), true).detail).toBe("No route matches");
    expect(failureOf("a thrown string", true).detail).toBe("a thrown string");
  });
});

describe("a blocked shop", () => {
  it("is explained, whatever the build (the guard throws { reason: \"blocked\" } from the /app middleware, where only the root can render it)", () => {
    for (const development of [false, true]) {
      expect(failureOf(response(403, { reason: "blocked" }), development)).toEqual({
        status: 403,
        title: "This account is unavailable",
        message: "Access to the app was turned off for this store. Contact support if you think this is a mistake.",
        detail: null,
      });
    }
  });

  it("is not a reason to explain any other 403", () => {
    expect(failureOf(response(403, { reason: "forbidden" }), false)).toMatchObject({ title: "You cannot open this page", message: null });
    expect(failureOf(response(403, ""), false).title).toBe("You cannot open this page");
  });
});
