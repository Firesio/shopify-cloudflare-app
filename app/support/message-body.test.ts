import { describe, expect, it } from "vitest";
import { bodyLines } from "./message-body";

describe("bodyLines", () => {
  it("splits on line breaks of either kind and drops blank lines", () => {
    expect(bodyLines("first\r\nsecond\n\n  \nthird")).toEqual(["first", "second", "third"]);
  });

  it("keeps a single line whole, with its own spacing", () => {
    expect(bodyLines("  indented   text ")).toEqual(["  indented   text "]);
  });

  it("is empty for an empty body, which a message with only files has", () => {
    expect(bodyLines("")).toEqual([]);
    expect(bodyLines("\n\n")).toEqual([]);
  });
});
