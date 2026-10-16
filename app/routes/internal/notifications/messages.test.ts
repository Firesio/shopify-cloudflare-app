import { describe, expect, it } from "vitest";
import { type NotificationActionError, type NotificationActionResult } from "~/domain/staff-notification-view";
import { buildMatrix } from "~/domain/staff-notification-topics";
import { describeResult, ERROR_MESSAGES, groupMatrix, PUSH_ERROR_MESSAGES } from "./messages";

const ERRORS: readonly NotificationActionError[] = ["invalid", "push_unavailable", "endpoint_not_allowed", "too_many_devices", "not_found", "test_failed"];

describe("describeResult", () => {
  it("has a non-empty sentence for every error the action can return", () => {
    for (const error of ERRORS) {
      expect(describeResult({ error })).toEqual({ error: ERROR_MESSAGES[error] });
      expect(ERROR_MESSAGES[error].length).toBeGreaterThan(10);
    }
    expect(Object.keys(PUSH_ERROR_MESSAGES).length).toBe(6);
  });

  it("stays quiet for a preference (the switch is its own confirmation) and when there is no result", () => {
    expect(describeResult({ success: "preference", topic: "shop_installed", channel: "push" })).toBeUndefined();
    expect(describeResult(undefined)).toBeUndefined();
  });

  it("confirms each device action in a sentence", () => {
    const results: readonly NotificationActionResult[] = [
      { success: "subscribed", id: "d1" },
      { success: "device-enabled" },
      { success: "device-removed" },
    ];
    expect(results.map((result) => describeResult(result)?.success)).toEqual([
      "This device will now receive notifications.",
      "Device updated.",
      "Device removed.",
    ]);
  });

  it("counts the devices a test reached, and reports a test that reached none as a failure", () => {
    expect(describeResult({ success: "test-sent", sent: 1 })).toEqual({ success: "Test sent to 1 device." });
    expect(describeResult({ success: "test-sent", sent: 3 })).toEqual({ success: "Test sent to 3 devices." });
    expect(describeResult({ success: "test-sent", sent: 0 })?.error).toContain("No device could be reached");
  });

});

describe("groupMatrix", () => {
  it("gathers the topics under Support, Shops and System, keeping their order", () => {
    const groups = groupMatrix(buildMatrix([]));
    expect(groups.map((group) => [group.label, group.rows.map((row) => row.topic)])).toEqual([
      ["Support", ["support_ticket_opened", "support_ticket_reply"]],
      ["Shops", ["shop_installed", "shop_uninstalled"]],
      ["System", ["webhook_dead_letter"]],
    ]);
  });

  it("is empty for no rows", () => {
    expect(groupMatrix([])).toEqual([]);
  });
});
