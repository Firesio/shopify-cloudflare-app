import { describe, expect, it } from "vitest";
import { formBodyRefusal } from "./body-limit";

const MAX = 64 * 1024;
const headers = (length?: string) => new Headers(length === undefined ? {} : { "content-length": length });

describe("formBodyRefusal", () => {
  it("lets a body up to the limit through, the limit included", () => {
    expect(formBodyRefusal(headers("0"), MAX)).toBeNull();
    expect(formBodyRefusal(headers("512"), MAX)).toBeNull();
    expect(formBodyRefusal(headers(String(MAX)), MAX)).toBeNull();
  });

  it("refuses one byte over with 413", () => {
    expect(formBodyRefusal(headers(String(MAX + 1)), MAX)).toBe(413);
    expect(formBodyRefusal(headers("99999999999"), MAX)).toBe(413);
  });

  it("refuses a body that announces no length (411) or a length that is not a number (400)", () => {
    expect(formBodyRefusal(headers(), MAX)).toBe(411);
    for (const bad of ["abc", "-1", "1.5", "1e9", " ", ""]) expect(formBodyRefusal(headers(bad), MAX), bad).toBe(400);
  });
});
