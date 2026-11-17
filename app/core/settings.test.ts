import { createSettings } from "@firesio/app/settings";
import { memorySettingsStore } from "@firesio/app/settings/testing";
import { describe, expect, it } from "vitest";
import { GENERAL_SETTINGS, SETTINGS } from "./settings";

const SHOP = "settings-test.myshopify.com";
const member = { actor: "member:1", allows: () => true };

describe("the sample settings group", () => {
  it("starts from its defaults and keeps what a member saves", async () => {
    const settings = createSettings({ store: memorySettingsStore(), now: () => 1 }, SETTINGS);
    expect(await settings.get(SHOP, GENERAL_SETTINGS)).toEqual({ signature: "", weeklySummary: false, summaryDay: "monday" });
    await settings.save(SHOP, GENERAL_SETTINGS, { signature: "The team", weeklySummary: true, summaryDay: "friday" }, member);
    expect(await settings.get(SHOP, GENERAL_SETTINGS)).toEqual({ signature: "The team", weeklySummary: true, summaryDay: "friday" });
  });

  it("puts the day back to its default when the summary is switched off (clearWhen)", async () => {
    const settings = createSettings({ store: memorySettingsStore(), now: () => 1 }, SETTINGS);
    await settings.save(SHOP, GENERAL_SETTINGS, { weeklySummary: true, summaryDay: "friday" }, member);
    const off = await settings.save(SHOP, GENERAL_SETTINGS, { weeklySummary: false }, member);
    expect(off.ok && off.value.summaryDay).toBe("monday");
  });
});
