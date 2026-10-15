import { describe, expect, it } from "vitest";
import {
  STAFF_CHANNELS,
  STAFF_TOPICS,
  STAFF_TOPIC_SPECS,
  buildMatrix,
  isEnabled,
  isStaffChannel,
  isStaffTopic,
} from "./staff-notification-topics";

describe("staff notification topics", () => {
  it("describes every topic", () => {
    for (const topic of STAFF_TOPICS) {
      const spec = STAFF_TOPIC_SPECS[topic];
      expect(spec.label.length, topic).toBeGreaterThan(0);
      expect(spec.description.length, topic).toBeGreaterThan(0);
      for (const channel of STAFF_CHANNELS) expect(typeof spec.defaults[channel]).toBe("boolean");
    }
  });

  it("recognises only real topics and channels", () => {
    expect(isStaffTopic("shop_installed")).toBe(true);
    expect(isStaffTopic("nope")).toBe(false);
    expect(isStaffTopic("")).toBe(false);
    expect(isStaffChannel("push")).toBe(true);
    expect(isStaffChannel("sms")).toBe(false);
  });

  it("falls back to the default when nothing is stored", () => {
    expect(isEnabled([], "support_ticket_opened", "email")).toBe(true);
    expect(isEnabled([], "shop_installed", "email")).toBe(false);
    expect(isEnabled([], "shop_installed", "push")).toBe(true);
  });

  it("lets a stored choice override the default in either direction", () => {
    const stored = [
      { topic: "support_ticket_opened", channel: "email", enabled: false },
      { topic: "shop_installed", channel: "email", enabled: true },
    ] as const;
    expect(isEnabled(stored, "support_ticket_opened", "email")).toBe(false);
    expect(isEnabled(stored, "shop_installed", "email")).toBe(true);
    // A choice on one channel never leaks onto the other.
    expect(isEnabled(stored, "support_ticket_opened", "push")).toBe(true);
  });

  it("builds a row per topic, in catalogue order, with the effective settings", () => {
    const matrix = buildMatrix([{ topic: "shop_uninstalled", channel: "push", enabled: false }]);
    expect(matrix.map((row) => row.topic)).toEqual([...STAFF_TOPICS]);
    const uninstall = matrix.find((row) => row.topic === "shop_uninstalled");
    expect(uninstall).toMatchObject({ email: false, push: false });
    const opened = matrix.find((row) => row.topic === "support_ticket_opened");
    expect(opened).toMatchObject({ email: true, push: true });
  });
});
