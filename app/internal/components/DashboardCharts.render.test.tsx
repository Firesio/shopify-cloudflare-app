import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import DashboardCharts from "./DashboardCharts";

describe("DashboardCharts", () => {
  it("renders every chart card when uninstall feedback is empty", () => {
    const html = renderToString(
      <MemoryRouter>
        <DashboardCharts
          trend={[{ month: "Jan", installs: 0, uninstalls: 0, active: 0 }]}
          uninstallFeedback={[]}
        />
      </MemoryRouter>
    );

    expect(html).toContain("Merchant growth");
    expect(html).toContain("Installs and uninstalls");
    expect(html).toContain("Uninstall reasons");
    expect(html).toContain("Merchant exit comments");
    expect(html).toContain("No merchant exit feedback submitted yet.");
  });

  it("renders when uninstall feedback is undefined without error", () => {
    const html = renderToString(
      <MemoryRouter>
        <DashboardCharts
          trend={[{ month: "Jan", installs: 0, uninstalls: 0, active: 0 }]}
        />
      </MemoryRouter>
    );

        expect(html).toContain("Merchant growth");
    expect(html).toContain("Uninstall reasons");
    expect(html).toContain("Merchant exit comments");
  });

  it("renders wrapped feedback and dialog trigger for long messages", () => {
    const html = renderToString(
      <MemoryRouter>
        <DashboardCharts
          trend={[{ month: "Jan", installs: 1, uninstalls: 1, active: 1 }]}
          uninstallFeedback={[
            {
              eventId: "evt-long",
              shop: "long.myshopify.com",
              shopName: "Long Store",
              logoUrl: null,
              occurredAt: 1780000000000,
              reason: "NOT_USING_APP",
              reasonDescription: "A".repeat(150),
            },
          ]}
        />
      </MemoryRouter>
    );

    expect(html).toContain("Long Store");
    expect(html).toContain("Not Using App");
    expect(html).toContain("View full message");
  });
});
