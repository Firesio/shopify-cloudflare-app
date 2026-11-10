import { describe, expect, it } from "vitest";
import { compliancePayloadSchema } from "./compliance-webhook";

describe("external payload schemas", () => {
  it("rejects primitive and array compliance payloads", () => {
    expect(compliancePayloadSchema.safeParse("payload").success).toBe(false);
    expect(compliancePayloadSchema.safeParse([]).success).toBe(false);
  });
});
