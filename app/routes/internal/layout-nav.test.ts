import { describe, expect, it } from "vitest";
import { titleFor } from "./layout-nav";

describe("titleFor", () => {
  it("titles the pages reached from the account menu, not only the sidebar", () => {
    expect(titleFor("/internal/notifications")).toBe("Notifications");
    expect(titleFor("/internal/profile")).toBe("Profile");
  });

  it("uses the longest known prefix and falls back for an unknown path", () => {
    expect(titleFor("/internal/support/42")).toBe("Support");
    expect(titleFor("/internal/nowhere")).toBe("Staff console");
  });
});
