// The import makes vitest.config.ts run this file in workerd, where the guard (`outboundService`) is installed: in Node it would reach the network.
import "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("the outbound guard", () => {
  it("blocks a request to the public internet in a workers test, with a message that says so", async () => {
    const response = await fetch("https://example.org/");
    expect(response.status).toBe(403);
    expect(await response.text()).toContain("Outbound network is blocked in tests");
  });
});
