import { describe, expect, it } from "vitest";
import type { PushMessage } from "../../types";
import { clip, encodePushPayload, MAX_BODY, MAX_TITLE } from "./payload";

const message = (over: Partial<PushMessage> = {}): PushMessage => ({
  kind: "push",
  to: "device-1",
  title: "New support ticket · Alpha",
  body: "Checkout is broken",
  url: "/internal/support/t-1",
  tag: "ticket:t-1",
  topic: "support_ticket_opened",
  urgency: "high",
  ttlSeconds: 86_400,
  ...over,
});

const decoded = (over: Partial<PushMessage> = {}): Record<string, unknown> => JSON.parse(encodePushPayload(message(over)));

describe("encodePushPayload", () => {
  it("carries exactly what the service worker reads, and nothing that identifies the device", () => {
    expect(decoded()).toEqual({
      title: "New support ticket · Alpha",
      body: "Checkout is broken",
      url: "/internal/support/t-1",
      tag: "ticket:t-1",
      topic: "support_ticket_opened",
    });
    expect(encodePushPayload(message())).not.toContain("device-1");
  });

  it("cuts an over-long title and body at a character, with an ellipsis", () => {
    const payload = decoded({ title: "t".repeat(500), body: "b".repeat(2_000) });
    expect(Array.from(String(payload.title))).toHaveLength(MAX_TITLE);
    expect(Array.from(String(payload.body))).toHaveLength(MAX_BODY);
    expect(String(payload.title).endsWith("…")).toBe(true);
  });

  it("does not split a character made of two UTF-16 units", () => {
    const body = decoded({ body: "😀".repeat(1_000) }).body;
    expect(Array.from(String(body)).every((character) => character === "😀" || character === "…")).toBe(true);
  });

  it("stays well inside the 4 KB a push service accepts, even in the worst case", () => {
    // Four-byte characters in the longest title and body, with a tag and topic as long as they may be.
    const bytes = new TextEncoder().encode(
      encodePushPayload(message({ title: "😀".repeat(1_000), body: "😀".repeat(1_000), tag: "x".repeat(1_000), topic: "y".repeat(1_000), url: `/internal/${"z".repeat(400)}` })),
    ).length;
    expect(bytes).toBeLessThan(3_800);
  });

  it("turns line breaks and control characters in a merchant's words into plain spaces", () => {
    expect(decoded({ body: "line one\n\nline\ttwo\u0000end" }).body).toBe("line one line two end");
  });

  it("re-checks the link: a url outside the console becomes the dashboard", () => {
    expect(decoded({ url: "https://evil.invalid/x" }).url).toBe("/internal/dashboard");
  });
});

describe("clip", () => {
  it("leaves a text within the limit exactly as it is, trimmed", () => {
    expect(clip("  fits  ", 10)).toBe("fits");
  });

  it("trims the space before the ellipsis", () => {
    expect(clip("hello world again", 12)).toBe("hello world…");
  });
});
