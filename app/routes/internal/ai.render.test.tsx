import { describe, expect, it } from "vitest";
import { MODEL_ROLES } from "~/ai/roles";
import { renderRoute } from "~/test/render-route";
import AiSettings from "./ai";
import { buildPurpose } from "./ai/purposes";
import type { AiModel } from "~/db/schema";

const NOW = 1_700_000_000_000;

function configured(role: (typeof MODEL_ROLES)[number]): AiModel {
  return { role, modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", priority: 0, enabled: true, healthy: true, lastFailedAt: null, updatedAt: NOW, updatedBy: null };
}

function page(stage: "pending" | "settled", configuredRoles: readonly (typeof MODEL_ROLES)[number][]): Promise<string> {
  const rows = configuredRoles.map(configured);
  const overview = {
    purposes: MODEL_ROLES.map((role) => buildPurpose(role, rows, NOW)),
    spend: { calls: 7, input: 1, output: 2 },
    runs: [],
  };
  return renderRoute({
    path: "/internal/ai",
    Component: AiSettings,
    loaderData: { overview: stage === "pending" ? new Promise<never>(() => {}) : Promise.resolve(overview) },
    stage,
  });
}

const cards = (html: string) => html.match(/data-slot="card"/g)?.length ?? 0;
const SET_UP = "Set up recommended";

describe("the AI settings loading state", () => {
  it("has as many cards as the loaded page, so nothing shifts when the data arrives", async () => {
    const pending = cards(await page("pending", []));
    // Streaming leaves the fallback in the markup beside the resolved content, so what the
    // settled page adds on top of the pending one is the loaded page itself.
    const loaded = cards(await page("settled", [])) - pending;

    expect(pending).toBe(loaded);
  });
});

describe("the recommended-setup bar", () => {
  it("says how many purposes are off and offers to fill them when none has models", async () => {
    const html = await page("settled", []);

    expect(html).toContain(`${MODEL_ROLES.length} of ${MODEL_ROLES.length} purposes have no models`);
    expect(html).toContain(SET_UP);
    expect(html).toContain("Reset all to recommended");
  });

  it("counts only the purposes still empty", async () => {
    const html = await page("settled", ["writing", "summary"]);

    expect(html).toContain(`${MODEL_ROLES.length - 2} of ${MODEL_ROLES.length} purposes have no models`);
  });

  it("drops the fill button once every purpose has models, keeping the confirmed reset", async () => {
    const html = await page("settled", MODEL_ROLES);

    expect(html).toContain("Every purpose has models.");
    expect(html).not.toContain(SET_UP);
    expect(html).toContain("Reset all to recommended");
  });
});
