import { describe, expect, it } from "vitest";
import { queueKind } from "./queue-names";

describe("queueKind", () => {
  it.each([
    ["shopify-webhooks", "webhook"],
    ["shopify-webhooks-prod", "webhook"],
    ["notifications", "notification"],
    ["notifications-prod", "notification"],
    ["campaigns", "campaign"],
    ["campaigns-prod", "campaign"],
    ["notifications-dlq", "unknown"],
    ["campaigns-dlq", "unknown"],
    ["", "unknown"],
  ])("%s -> %s", (name, kind) => {
    expect(queueKind(name)).toBe(kind);
  });
});
