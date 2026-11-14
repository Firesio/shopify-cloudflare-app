import { describe, expect, it } from "vitest";
import { loader } from "./healthz";

describe("/healthz", () => {
  it("answers 200 with ok when D1 answers, never cached, and says nothing about any shop", async () => {
    const response = await loader();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });
});
