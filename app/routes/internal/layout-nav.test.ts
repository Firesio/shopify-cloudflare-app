import { describe, expect, it } from "vitest";
import { INTERNAL_NAV, titleFor } from "./layout-nav";

describe("titleFor", () => {
  it("titles the pages reached from the account menu, not only the sidebar", () => {
    expect(titleFor("/internal/notifications")).toBe("Notifications");
    expect(titleFor("/internal/profile")).toBe("Profile");
  });

  it("uses the longest known prefix and falls back for an unknown path", () => {
    expect(titleFor("/internal/support/42")).toBe("Support");
    expect(titleFor("/internal/nowhere")).toBe("Staff console");
  });

  it("lists campaigns in the sidebar, and titles the editor and the report under it", () => {
    const hrefs = INTERNAL_NAV.flatMap((group) => group.items.map((item) => [item.title, item.href]));
    expect(hrefs).toContainEqual(["Campaigns", "/internal/campaigns"]);
    expect(titleFor("/internal/campaigns")).toBe("Campaigns");
    expect(titleFor("/internal/campaigns/new")).toBe("Campaigns");
    expect(titleFor("/internal/campaigns/6f1c")).toBe("Campaigns");
  });
});
